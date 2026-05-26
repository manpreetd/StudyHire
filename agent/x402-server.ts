import { GoatX402Client, parseX402Header, type X402PaymentRequired } from "goatx402-sdk-server";
import type { Request, Response, NextFunction } from "express";
import { env } from "@/lib/env";
import { activity } from "./activity";
import { addressOf } from "./wallet";

/**
 * x402 paywall middleware built on the real `goatx402-sdk-server`.
 *
 * Two-phase flow:
 *   1. Request arrives without `x-payment-order-id` header → we create an order with
 *      the GoatX402 merchant API and respond 402 with the x402 challenge body the
 *      client needs to make payment.
 *   2. Request arrives with `x-payment-order-id` → we ask the SDK for the order
 *      status; if confirmed, we let it through and stash the proof on res.locals.
 *
 * Mock-mode (env.useMockX402 = true) bypasses the SDK entirely so the demo runs
 * offline before merchant credentials are issued.
 */

function maybeClient(): GoatX402Client | undefined {
  if (env.useMockX402) return undefined;
  if (!env.goatX402ApiKey || !env.goatX402ApiSecret) return undefined;
  return new GoatX402Client({
    baseUrl: env.goatX402ApiUrl,
    apiKey: env.goatX402ApiKey,
    apiSecret: env.goatX402ApiSecret,
  });
}

const client = maybeClient();

export interface PaywallOptions {
  priceUsd: number;
  symbol?: string;        // default USDC
  tokenContract?: string; // default env.usdcAddress
}

export function x402Paywall(opts: PaywallOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (env.useMockX402 || !client) return next();

    try {
      const orderId = req.header("x-payment-order-id");
      const txHash = req.header("x-payment-tx");

      if (!orderId) {
        // Phase 1 — create order and serve 402 challenge.
        const payerAddress =
          (typeof req.body?.payerAddress === "string" && req.body.payerAddress) ||
          req.header("x-payer-address") ||
          undefined;

        if (!payerAddress) {
          return res.status(400).json({
            error: "missing_payer",
            hint: "Include 'payerAddress' in request body or 'x-payer-address' header so we can create the x402 order.",
          });
        }

        const amountWei = BigInt(Math.round(opts.priceUsd * 1_000_000)).toString(); // USDC = 6 dec
        const order = await client.createOrderRaw({
          dappOrderId: `studyhire-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          chainId: env.goatChainId,
          tokenSymbol: opts.symbol ?? "USDC",
          tokenContract: opts.tokenContract ?? env.usdcAddress,
          fromAddress: payerAddress,
          amountWei,
        });
        return res.status(402).json(order satisfies X402PaymentRequired);
      }

      // Phase 2 — verify payment.
      const status = await client.getOrderStatus(orderId);
      if (status.status !== "PAYMENT_CONFIRMED" && status.status !== "INVOICED") {
        return res.status(402).json({
          error: "payment_not_confirmed",
          orderId,
          currentStatus: status.status,
          observedTxHash: txHash ?? null,
        });
      }

      res.locals.x402Proof = status;
      activity.push({
        kind: "x402_payment",
        title: `x402 verified ${opts.priceUsd.toFixed(2)} ${opts.symbol ?? "USDC"} (order ${orderId})`,
        body: status.txHash,
      });
      return next();
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown";
      activity.push({ kind: "error", title: "x402 paywall error", body: reason });
      return res.status(500).json({ error: "x402_paywall_error", reason });
    }
  };
}

export function paywalledAgentAddress(): string {
  return addressOf(env.topicExtractorKey);
}
