import { config } from "dotenv";

// Load .env.local first (matches Next.js precedence), then .env as fallback.
// override:true so that an empty/stale shell var (e.g. a leftover Windows PS
// session that set ANTHROPIC_API_KEY="") cannot silently mask the real value.
config({ path: ".env.local", override: true });
config({ path: ".env", override: false });

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function opt(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (Number.isNaN(n)) throw new Error(`Env var ${name} is not a number: ${raw}`);
  return n;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return raw === "1" || raw.toLowerCase() === "true";
}

export const env = {
  // Optional at import time so the bot can boot without it (e.g. for chat-id capture).
  // The LLM wrapper throws clearly if it's used without being set.
  anthropicApiKey: opt("ANTHROPIC_API_KEY", ""),
  anthropicModel: opt("ANTHROPIC_MODEL", "claude-opus-4-7"),

  telegramBotToken: opt("TELEGRAM_BOT_TOKEN", ""),
  telegramChatId: opt("TELEGRAM_CHAT_ID", ""),

  spendingLimitUsd: num("SPENDING_LIMIT_USD", 5),

  goatRpcUrl: opt("GOAT_RPC_URL", "https://rpc.goat.network"),
  goatChainId: num("GOAT_CHAIN_ID", 2345),
  usdcAddress: opt("USDC_ADDRESS", ""),

  orchestratorKey: opt("ORCHESTRATOR_PRIVATE_KEY", ""),
  topicExtractorKey: opt("TOPIC_EXTRACTOR_PRIVATE_KEY", ""),
  submitterAKey: opt("SUBMITTER_A_PRIVATE_KEY", ""),
  submitterBKey: opt("SUBMITTER_B_PRIVATE_KEY", ""),
  verifierKey: opt("VERIFIER_PRIVATE_KEY", ""),

  studyBountyAddress: opt("STUDY_BOUNTY_ADDRESS", ""),
  erc8004RegistryAddress: opt("ERC8004_REGISTRY_ADDRESS", ""),

  topicExtractorUrl: opt("X402_TOPIC_EXTRACTOR_URL", "http://localhost:4001"),
  topicExtractorPriceUsd: num("X402_TOPIC_EXTRACTOR_PRICE_USD", 0.1),

  // goatx402-sdk-server credentials (from https://x402-merchant.goat.network/)
  goatX402ApiUrl: opt("GOATX402_API_URL", "https://x402-merchant.goat.network"),
  goatX402ApiKey: opt("GOATX402_API_KEY", ""),
  goatX402ApiSecret: opt("GOATX402_API_SECRET", ""),
  goatX402MerchantId: opt("GOATX402_MERCHANT_ID", ""),

  topicExtractorPort: num("TOPIC_EXTRACTOR_PORT", 4001),
  submitterAPort: num("SUBMITTER_A_PORT", 4002),
  submitterBPort: num("SUBMITTER_B_PORT", 4003),
  verifierPort: num("VERIFIER_PORT", 4004),

  useMockX402: bool("USE_MOCK_X402", true),
  useMockChain: bool("USE_MOCK_CHAIN", true),
};
