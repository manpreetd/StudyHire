import type { Address } from "viem";
import { env } from "@/lib/env";
import { addressOf, publicGoat, walletFor } from "./wallet";
import { activity } from "./activity";

/**
 * ERC-8004 agent registry on GOAT mainnet.
 *
 * Workshop spec (Onboarding Guide):
 *   - Contract: 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 (chain 2345)
 *   - Method:   register(string name)        — only takes the name on-chain
 *   - View:     getAgentWallet(uint256)      — verify the agent ID maps back to the wallet
 *
 * Agent metadata (description / wallet / URL / x402 details) lives off-chain. The
 * onboarding guide recommends a public GitHub Gist for the metadata JSON.
 *
 * If you'd rather skip the scripted path, the dashboard at
 *   https://goat-hackathon-2026.vercel.app/
 * has a "Register agent" button that does the same on-chain call.
 */

const REGISTRY_ABI = [
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [{ name: "name", type: "string" }],
    outputs: [],
  },
  {
    type: "function",
    name: "getAgentWallet",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
  {
    // ERC-721-style Transfer event — registry mints an agent ID token to msg.sender.
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
    ],
  },
] as const;

export interface AgentDescriptor {
  key: string;             // env var name holding the private key
  name: string;            // human-readable name; passed to register(string)
  metadataURI: string;     // for off-chain gist; not stored on-chain
}

export const AGENTS: AgentDescriptor[] = [
  { key: "ORCHESTRATOR_PRIVATE_KEY", name: "studyhire_orchestrator", metadataURI: "https://gist.github.com/REPLACE/orchestrator.txt" },
  { key: "TOPIC_EXTRACTOR_PRIVATE_KEY", name: "studyhire_topic_extractor", metadataURI: "https://gist.github.com/REPLACE/topic-extractor.txt" },
  { key: "SUBMITTER_A_PRIVATE_KEY", name: "studyhire_submitter_a", metadataURI: "https://gist.github.com/REPLACE/submitter-a.txt" },
  { key: "SUBMITTER_B_PRIVATE_KEY", name: "studyhire_submitter_b", metadataURI: "https://gist.github.com/REPLACE/submitter-b.txt" },
  { key: "VERIFIER_PRIVATE_KEY", name: "studyhire_verifier", metadataURI: "https://gist.github.com/REPLACE/verifier.txt" },
];

export async function registerAgent(d: AgentDescriptor): Promise<{
  ok: boolean;
  txHash?: string;
  agentId?: string;
  reason?: string;
  address: Address;
  explorerUrl?: string;
}> {
  const pk = process.env[d.key] ?? "";
  const address = addressOf(pk);

  // Note: useMockChain only gates the StudyBounty escrow — ERC-8004 is a real contract
  // on GOAT mainnet that's always available. Only skip if the registry address is missing.
  if (!env.erc8004RegistryAddress) {
    activity.push({ kind: "agent_thought", title: `(mock) Would register ${d.name} @ ${address} — no registry address` });
    return { ok: true, txHash: `0xmock-${d.name}`, address, agentId: "mock-id" };
  }

  try {
    const wallet = walletFor(pk);
    const txHash = await wallet.writeContract({
      abi: REGISTRY_ABI,
      address: env.erc8004RegistryAddress as Address,
      functionName: "register",
      args: [d.name],
    });
    const receipt = await publicGoat().waitForTransactionReceipt({ hash: txHash });

    // Pull agent ID from the ERC-721 Transfer event's tokenId (topic[3]).
    const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    const log = receipt.logs.find((l) => l.topics[0] === transferTopic);
    const agentId = log?.topics[3] ? BigInt(log.topics[3]).toString() : undefined;

    activity.push({
      kind: "agent_thought",
      title: `Registered ${d.name} on ERC-8004`,
      body: `agentId=${agentId ?? "?"} tx=${txHash}`,
    });

    return {
      ok: true,
      txHash,
      agentId,
      address,
      explorerUrl: `https://explorer.goat.network/tx/${txHash}`,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown";
    activity.push({ kind: "error", title: `Register ${d.name} failed`, body: reason });
    return { ok: false, reason, address };
  }
}

export async function verifyAgentWallet(agentId: bigint): Promise<Address | undefined> {
  if (!env.erc8004RegistryAddress) return undefined;
  const client = publicGoat();
  const addr = await client.readContract({
    abi: REGISTRY_ABI,
    address: env.erc8004RegistryAddress as Address,
    functionName: "getAgentWallet",
    args: [agentId],
  });
  return addr as Address;
}
