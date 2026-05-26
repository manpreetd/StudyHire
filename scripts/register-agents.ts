import { AGENTS, registerAgent } from "@/agent/registry";

/**
 * Register all 5 StudyHire sub-agents on GOAT mainnet's ERC-8004 registry
 * (0x8004A169FB4a3325136EB29fA0ceB6D2e539a432). Each agent needs:
 *   1) A funded wallet (mainnet gas — request from the gas form in the onboarding guide)
 *   2) A public metadata gist (off-chain JSON the verifier can fetch)
 *
 * After this runs, visit https://8004scan.io/agents?chain=2345 — the agents must appear
 * there for the hackathon's submission gatekeeper to pass.
 */
async function main() {
  console.log("Registering agents on ERC-8004 (GOAT mainnet, chain 2345)…\n");
  for (const a of AGENTS) {
    const r = await registerAgent(a);
    if (r.ok) {
      console.log(
        `✓ ${a.name.padEnd(34)} ${r.address}  agentId=${r.agentId ?? "-"}  tx=${r.txHash ?? "-"}`
      );
      if (r.explorerUrl) console.log(`    explorer: ${r.explorerUrl}`);
    } else {
      console.log(`✗ ${a.name.padEnd(34)} ${r.address}  reason=${r.reason}`);
    }
  }
  console.log("\nVerify with: npm run verify-8004");
  console.log("Or browse:   https://8004scan.io/agents?chain=2345");
  console.log("\nNote: each agent's wallet must be gas-funded (mainnet) before this call.");
  console.log("Use the gas request form in the onboarding guide. Manual fallback:");
  console.log("  https://goat-hackathon-2026.vercel.app/  → 'Register agent'");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
