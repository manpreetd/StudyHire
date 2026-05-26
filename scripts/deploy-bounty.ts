import { readFileSync } from "node:fs";
import { join } from "node:path";
import { env } from "@/lib/env";
import { addressOf, publicGoat, walletFor } from "@/agent/wallet";

/**
 * Deploy StudyHire.sol to GOAT mainnet.
 *
 * The hackathon plan calls for a Remix deploy as the fast path. This script is the
 * scripted alternative, useful if Remix is wedged. It expects a precompiled artifact
 * at contracts/StudyHire.bytecode.json with { bytecode: "0x..." } produced by
 * solc or hardhat.
 */
async function main() {
  if (!env.orchestratorKey) throw new Error("ORCHESTRATOR_PRIVATE_KEY missing");
  if (!env.usdcAddress) throw new Error("USDC_ADDRESS missing");
  if (!env.verifierKey) throw new Error("VERIFIER_PRIVATE_KEY missing (used to derive verifier address)");

  const verifier = addressOf(env.verifierKey);
  const treasury = addressOf(env.orchestratorKey); // we take our own 5% for the demo

  const artifactPath = join(process.cwd(), "contracts", "StudyHire.bytecode.json");
  const artifact = JSON.parse(readFileSync(artifactPath, "utf-8")) as { bytecode: `0x${string}`; abi: any };

  const wallet = walletFor(env.orchestratorKey);
  console.log(`Deploying StudyHire(${env.usdcAddress}, ${verifier}, ${treasury}) from ${addressOf(env.orchestratorKey)}...`);

  const hash = await wallet.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    args: [env.usdcAddress as `0x${string}`, verifier, treasury],
  });
  const receipt = await publicGoat().waitForTransactionReceipt({ hash });
  console.log(`✓ Deployed at ${receipt.contractAddress}`);
  console.log(`  Set STUDY_BOUNTY_ADDRESS=${receipt.contractAddress} in .env.local`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
