/**
 * Sends a tiny amount of GOAT from the orchestrator wallet to the other 4
 * agent wallets so they can pay gas for ERC-8004 registration.
 *
 * Gas on GOAT mainnet is ~0.0001 Gwei, so each registration costs ~0.00000003 GOAT.
 * Sending 0.000002 GOAT to each wallet gives them ~60 registration attempts each.
 *
 * Usage:
 *   npx tsx scripts/fund-agents.ts
 */
import { parseEther } from "viem";
import { env } from "@/lib/env";
import { addressOf, publicGoat, walletFor } from "@/agent/wallet";

const AMOUNT_GOAT = "0.0000004"; // 4e-7 GOAT — enough for 40+ registration txs at GOAT's ~0.0001 Gwei gas

const RECIPIENTS = [
  { name: "topic-extractor", key: env.topicExtractorKey },
  { name: "submitter-a",     key: env.submitterAKey },
  { name: "submitter-b",     key: env.submitterBKey },
  { name: "verifier",        key: env.verifierKey },
];

async function main() {
  if (!env.orchestratorKey) throw new Error("ORCHESTRATOR_PRIVATE_KEY not set");

  const wallet = walletFor(env.orchestratorKey);
  const from = addressOf(env.orchestratorKey);
  const bal = await publicGoat().getBalance({ address: from });
  console.log(`Orchestrator (${from}): ${(Number(bal) / 1e18).toFixed(8)} GOAT\n`);

  const amount = parseEther(AMOUNT_GOAT);
  const totalNeeded = amount * BigInt(RECIPIENTS.length);
  if (bal < totalNeeded) {
    throw new Error(
      `Insufficient balance. Need ${(Number(totalNeeded) / 1e18).toFixed(8)} GOAT, have ${(Number(bal) / 1e18).toFixed(8)} GOAT`
    );
  }

  for (const r of RECIPIENTS) {
    if (!r.key) {
      console.log(`⚠  ${r.name}: private key not set — skipping`);
      continue;
    }
    const to = addressOf(r.key);
    try {
      const hash = await wallet.sendTransaction({ to, value: amount });
      await publicGoat().waitForTransactionReceipt({ hash });
      console.log(`✓  ${r.name.padEnd(18)} ${to}  +${AMOUNT_GOAT} GOAT  tx=${hash}`);
    } catch (err) {
      console.error(`✗  ${r.name}: ${(err as Error).message}`);
    }
  }

  console.log("\nDone. Now run: npm run register");
}

main().catch((err) => { console.error(err); process.exit(1); });
