import { keccak256, toHex, parseUnits, type Address } from "viem";
import { env } from "@/lib/env";
import { addressOf, publicGoat, walletFor } from "./wallet";
import { activity } from "./activity";

const ABI = [
  {
    type: "function",
    name: "postBounty",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "deadline", type: "uint64" },
      { name: "brief", type: "bytes32" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  {
    type: "function",
    name: "submit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "contentHash", type: "bytes32" },
    ],
    outputs: [{ name: "idx", type: "uint256" }],
  },
  {
    type: "function",
    name: "declareWinner",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "submissionIdx", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "BountyPosted",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "client", type: "address", indexed: true },
      { name: "amount", type: "uint256" },
      { name: "deadline", type: "uint64" },
      { name: "brief", type: "bytes32" },
    ],
  },
  {
    type: "event",
    name: "Submitted",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "submitter", type: "address", indexed: true },
      { name: "idx", type: "uint256" },
      { name: "contentHash", type: "bytes32" },
    ],
  },
  {
    type: "event",
    name: "WinnerDeclared",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "winner", type: "address", indexed: true },
      { name: "payout", type: "uint256" },
      { name: "takeFee", type: "uint256" },
    ],
  },
] as const;

const USDC_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

function briefHash(brief: object): `0x${string}` {
  return keccak256(toHex(JSON.stringify(brief)));
}

export interface PostBountyArgs {
  amountUsd: number;
  deadlineSec: number; // seconds from now
  brief: { course: string; topic: string; deliverable: string; notes?: string };
}

export async function postBounty(args: PostBountyArgs): Promise<{
  ok: boolean;
  id?: string;
  txHash?: string;
  explorerUrl?: string;
  reason?: string;
}> {
  if (env.useMockChain || !env.studyBountyAddress) {
    const id = `mock-${Date.now().toString(36)}`;
    const txHash = `0xmock${id}`;
    activity.push({
      kind: "bounty_posted",
      title: `Bounty posted (mock) $${args.amountUsd.toFixed(2)} — ${args.brief.topic}`,
      data: { id, amountUsd: args.amountUsd, brief: args.brief },
    });
    return { ok: true, id, txHash, explorerUrl: `https://8004scan.io/tx/${txHash}` };
  }

  try {
    const wallet = walletFor(env.orchestratorKey);
    const me = addressOf(env.orchestratorKey);
    const amount = parseUnits(args.amountUsd.toString(), 6); // USDC = 6 decimals
    const deadline = BigInt(Math.floor(Date.now() / 1000) + args.deadlineSec);
    const brief = briefHash(args.brief);

    // Approve USDC then post.
    const approveHash = await wallet.writeContract({
      abi: USDC_ABI,
      address: env.usdcAddress as Address,
      functionName: "approve",
      args: [env.studyBountyAddress as Address, amount],
    });
    await publicGoat().waitForTransactionReceipt({ hash: approveHash });

    const txHash = await wallet.writeContract({
      abi: ABI,
      address: env.studyBountyAddress as Address,
      functionName: "postBounty",
      args: [amount, deadline, brief],
    });
    const receipt = await publicGoat().waitForTransactionReceipt({ hash: txHash });

    activity.push({
      kind: "bounty_posted",
      title: `Bounty posted $${args.amountUsd.toFixed(2)} — ${args.brief.topic}`,
      body: txHash,
      data: { amountUsd: args.amountUsd, brief: args.brief, client: me, txHash },
    });

    return {
      ok: true,
      txHash,
      explorerUrl: `https://8004scan.io/tx/${txHash}`,
      id: receipt.logs[0]?.topics?.[1] ?? undefined,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown";
    activity.push({ kind: "error", title: "postBounty failed", body: reason });
    return { ok: false, reason };
  }
}
