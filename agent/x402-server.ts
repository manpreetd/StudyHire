import type { Request, Response, NextFunction } from "express";
import { env } from "@/lib/env";
import { activity } from "./activity";
import { addressOf, publicGoat } from "./wallet";

/**
 * x402 paywall middleware — native implementation of the x402 HTTP payment protocol.
 *
 * Two-phase flow (standard x402):
 *   Phase 1 — no x-payment-tx header:
 *     Respond 402 with a challenge: { accepts: [{ payTo, amount, asset, network }], order_id }
 *     The client must transfer `amount` of `asset` to `payTo` on the specified network.
 *
 *   Phase 2 — x-payment-tx header present:
 *     Verify the on-chain transfer happened (correct asset, correct payTo, correct amount).
 *     If confirmed, let the request through.
 *
 * Mock-mode (env.useMockX402 = true) bypasses all chain calls so the demo runs
 * without a funded wallet.
 */

export interface PaywallOptions {
  priceUsd: number;
  symbol?: string;        // default USDC
  tokenContract?: string; // default env.usdcAddress
}

const ERC20_TRANSFER_EVENT =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export function x402Paywall(opts: PaywallOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (env.useMockX402) return next();

    try {
      const txHash = req.header("x-payment-tx") as `0x${string}` | undefined;
      const orderId = req.header("x-payment-order-id");

      const payTo = addressOf(env.topicExtractorKey).toLowerCase();
      const asset = (opts.tokenContract ?? env.usdcAddress).toLowerCase();
      const amountWei = BigInt(Math.round(opts.priceUsd * 1_000_000)); // USDC 6 dec

      if (!txHash) {
        // Phase 1 — issue a standard x402 challenge.
        const challenge = {
          x402Version: 1,
          order_id: `studyhire-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          accepts: [
            {
              scheme: "exact",
              network: `eip155:${env.goatChainId}`,
              asset,
              payTo: addressOf(env.topicExtractorKey),
              amount: amountWei.toString(),
              extra: { tokenSymbol: opts.symbol ?? "USDC", flow: "ERC20_DIRECT" },
            },
          ],
          extensions: {
            goatx402: { expiresAt: Math.floor(Date.now() / 1000) + 300 },
          },
        };
        return res.status(402).json(challenge);
      }

      // Phase 2 — verify the on-chain transfer.
      let confirmed = false;
      try {
        const receipt = await publicGoat().getTransactionReceipt({ hash: txHash });
        if (receipt.status === "success") {
          // Look for an ERC-20 Transfer(from, to, amount) to payTo of amountWei.
          confirmed = receipt.logs.some((log) => {
            if (log.topics[0]?.toLowerCase() !== ERC20_TRANSFER_EVENT) return false;
            if (log.address.toLowerCase() !== asset) return false;
            const to = "0x" + (log.topics[2] ?? "").slice(26).toLowerCase();
            const value = BigInt(log.data || "0x0");
            return to === payTo && value >= amountWei;
          });
        }
      } catch {
        // If RPC is unreachable, fall through to unconfirmed branch.
      }

      if (!confirmed) {
        return res.status(402).json({
          error: "payment_not_confirmed",
          txHash,
          hint: "Transfer not found or amount too low. Ensure USDC was sent to the payTo address on the correct chain.",
        });
      }

      res.locals.x402Proof = { txHash, orderId };
      activity.push({
        kind: "x402_payment",
        title: `x402 verified $${opts.priceUsd.toFixed(2)} ${opts.symbol ?? "USDC"}`,
        body: txHash,
        data: { txHash, orderId: orderId ?? null },
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
