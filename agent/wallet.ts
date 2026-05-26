import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { env } from "@/lib/env";

export const goatChain = {
  id: env.goatChainId,
  name: "GOAT",
  nativeCurrency: { name: "GOAT", symbol: "GOAT", decimals: 18 },
  rpcUrls: { default: { http: [env.goatRpcUrl] } },
} as const;

function normalize(pk: string): `0x${string}` {
  if (!pk) return "0x0000000000000000000000000000000000000000000000000000000000000000";
  return (pk.startsWith("0x") ? pk : `0x${pk}`) as `0x${string}`;
}

export function publicGoat() {
  return createPublicClient({ chain: goatChain, transport: http(env.goatRpcUrl) });
}

export function walletFor(privateKey: string) {
  const account = privateKeyToAccount(normalize(privateKey));
  return createWalletClient({ account, chain: goatChain, transport: http(env.goatRpcUrl) });
}

export function addressOf(privateKey: string): Address {
  return privateKeyToAccount(normalize(privateKey)).address;
}
