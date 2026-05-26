import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { env } from "./env";

let _client: Anthropic | undefined;
function client(): Anthropic {
  if (_client) return _client;
  if (!env.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set — needed to call the LLM. Add it to .env.local.");
  }
  _client = new Anthropic({ apiKey: env.anthropicApiKey });
  return _client;
}

const CACHE_DIR = ".cache/llm";

function ensureCache() {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
}

function cacheKey(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 32);
}

export type Tool = Anthropic.Tool;
export type ToolUseBlock = Anthropic.ToolUseBlock;
export type TextBlock = Anthropic.TextBlock;
export type Message = Anthropic.MessageParam;

export interface CompleteArgs {
  system?: string;
  messages: Message[];
  tools?: Tool[];
  maxTokens?: number;
  cache?: boolean;
}

export async function complete(args: CompleteArgs): Promise<Anthropic.Message> {
  const payload = {
    model: env.anthropicModel,
    max_tokens: args.maxTokens ?? 1024,
    system: args.system,
    messages: args.messages,
    tools: args.tools,
  };

  if (args.cache) {
    ensureCache();
    const key = cacheKey(payload);
    const path = join(CACHE_DIR, `${key}.json`);
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, "utf-8")) as Anthropic.Message;
    }
    const res = await client().messages.create(payload);
    writeFileSync(path, JSON.stringify(res, null, 2));
    return res;
  }

  return client().messages.create(payload);
}

export function textOf(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

export function toolCallsOf(msg: Anthropic.Message): ToolUseBlock[] {
  return msg.content.filter((b): b is ToolUseBlock => b.type === "tool_use");
}
