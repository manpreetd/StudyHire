import { parseUnits, type Address } from "viem";
import { env } from "@/lib/env";
import { activity } from "./activity";
import { addressOf, publicGoat, walletFor } from "./wallet";

export interface PaymentReceipt {
  txHash: string;
  explorerUrl: string;
  amountUsd: number;
  payer: string;
  payee: string;
  orderId?: string;
}

export interface PaidFetchResult<T = unknown> {
  ok: true;
  data: T;
  receipt: PaymentReceipt;
}

export interface PaidFetchError {
  ok: false;
  reason: string;
  status?: number;
}

const EXPLORER = "https://explorer.goat.network";

const ERC20_TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

function fakeTxHash(): string {
  const hex = "0123456789abcdef";
  let s = "0x";
  for (let i = 0; i < 64; i++) s += hex[Math.floor(Math.random() * 16)];
  return s;
}

interface X402Accept {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  extra?: { tokenSymbol?: string; flow?: string };
}

interface X402Challenge {
  x402Version?: number;
  accepts?: X402Accept[];
  extensions?: { goatx402?: { expiresAt?: number } };
  // Goat SDK extension: the order it just created on our behalf.
  orderId?: string;
}

/**
 * payAndFetch: hits an x402-paywalled URL. On 402 challenge, pays USDC.e on chain
 * 2345 to the merchant's payTo address using the orchestrator's wallet, then retries
 * with `x-payment-order-id` + `x-payment-tx` headers so the merchant can verify.
 *
 * In mock mode (env.useMockX402=true) we short-circuit: hit the endpoint without
 * any payment, fabricate a receipt, and return. The mock branch lets the demo run
 * before merchant credentials + funded wallets are issued by the GOAT team.
 */
export async function payAndFetch<T = unknown>(
  url: string,
  init?: RequestInit & { json?: unknown }
): Promise<PaidFetchResult<T> | PaidFetchError> {
  const baseBody = init?.json !== undefined ? JSON.stringify(init.json) : init?.body;
  const baseHeaders: Record<string, string> = {
    "content-type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  const method = init?.method ?? "POST";

  if (env.useMockX402) {
    try {
      const res = await fetch(url, { method, headers: baseHeaders, body: baseBody });
      if (!res.ok) {
        return { ok: false, reason: `upstream_${res.status}`, status: res.status };
      }
      const data = (await res.json()) as T;
      const receipt: PaymentReceipt = {
        txHash: fakeTxHash(),
        explorerUrl: `${EXPLORER}/tx/${fakeTxHash()}`,
        amountUsd: env.topicExtractorPriceUsd,
        payer: env.orchestratorKey ? addressOf(env.orchestratorKey) : "orchestrator(mock)",
        payee: new URL(url).host,
      };
      activity.push({
        kind: "x402_payment",
        title: `x402 mock payment $${receipt.amountUsd.toFixed(2)} → ${receipt.payee}`,
        body: receipt.txHash,
        data: receipt as unknown as Record<string, unknown>,
      });
      return { ok: true, data, receipt };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : "network_error" };
    }
  }

  // --- REAL x402 path ---
  if (!env.orchestratorKey) return { ok: false, reason: "no_orchestrator_wallet" };
  const payerAddress = addressOf(env.orchestratorKey);

  // Phase 1: ask the merchant for an order/challenge. The merchant needs our payer
  // address up front (see x402-server.ts paywall).
  let challengeBody: object;
  try {
    const parsed = baseBody ? JSON.parse(baseBody as string) : {};
    challengeBody = { ...parsed, payerAddress };
  } catch {
    challengeBody = { payerAddress };
  }

  let challenge: X402Challenge;
  try {
    const first = await fetch(url, {
      method,
      headers: baseHeaders,
      body: JSON.stringify(challengeBody),
    });
    if (first.status === 200) {
      // Endpoint isn't actually paywalled — return immediately.
      const data = (await first.json()) as T;
      return {
        ok: true,
        data,
        receipt: {
          txHash: "(no_payment_required)",
          explorerUrl: "",
          amountUsd: 0,
          payer: payerAddress,
          payee: new URL(url).host,
        },
      };
    }
    if (first.status !== 402) {
      return { ok: false, reason: `unexpected_${first.status}`, status: first.status };
    }
    challenge = (await first.json()) as X402Challenge;
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "network_error" };
  }

  const accept = challenge.accepts?.[0];
  const orderId = (challenge as { orderId?: string }).orderId;
  if (!accept || !orderId) {
    return { ok: false, reason: "malformed_x402_challenge" };
  }

  // Phase 2: send a real on-chain transfer.
  let txHash: `0x${string}`;
  try {
    const wallet = walletFor(env.orchestratorKey);
    txHash = await wallet.writeContract({
      abi: ERC20_TRANSFER_ABI,
      address: accept.asset as Address,
      functionName: "transfer",
      args: [accept.payTo as Address, BigInt(accept.amount)],
    });
    await publicGoat().waitForTransactionReceipt({ hash: txHash });
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "transfer_failed" };
  }

  // Phase 3: re-request with payment headers; merchant verifies via SDK.
  try {
    const second = await fetch(url, {
      method,
      headers: {
        ...baseHeaders,
        "x-payment-order-id": orderId,
        "x-payment-tx": txHash,
      },
      body: baseBody,
    });
    if (!second.ok) {
      return { ok: false, reason: `verify_${second.status}`, status: second.status };
    }
    const data = (await second.json()) as T;
    const amountUsd = Number(accept.amount) / 1_000_000;
    const receipt: PaymentReceipt = {
      txHash,
      explorerUrl: `${EXPLORER}/tx/${txHash}`,
      amountUsd,
      payer: payerAddress,
      payee: accept.payTo,
      orderId,
    };
    activity.push({
      kind: "x402_payment",
      title: `x402 paid $${amountUsd.toFixed(2)} ${accept.extra?.tokenSymbol ?? "USDC"} → ${accept.payTo.slice(0, 10)}…`,
      body: txHash,
      data: receipt as unknown as Record<string, unknown>,
    });
    return { ok: true, data, receipt };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "retry_failed" };
  }
}
