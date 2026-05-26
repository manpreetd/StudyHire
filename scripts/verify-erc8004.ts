import { AGENTS } from "@/agent/registry";
import { addressOf } from "@/agent/wallet";

/**
 * Hits 8004scan.io to verify all 5 of our agents show up on chain 2345 — this is
 * what the judges visually check for Gatekeeper 1.
 */
async function main() {
  console.log("Checking https://8004scan.io for agent registrations on chain 2345…\n");
  for (const a of AGENTS) {
    const pk = process.env[a.key] ?? "";
    const addr = addressOf(pk);
    const url = `https://8004scan.io/agents?chain=2345&address=${addr}`;
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      const ok = res.status === 200;
      console.log(`${ok ? "✓" : "✗"} ${a.name.padEnd(34)} ${addr}  ${url}`);
    } catch (err) {
      console.log(`? ${a.name.padEnd(34)} ${addr}  ${(err as Error).message}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
