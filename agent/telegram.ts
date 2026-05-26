import { env } from "@/lib/env";
import { activity } from "./activity";

const API = (token: string) => `https://api.telegram.org/bot${token}`;

export type ParseMode = "Markdown" | "MarkdownV2" | "HTML";

export interface SendOpts {
  chatId?: string | number;
  parseMode?: ParseMode;
  disableWebPreview?: boolean;
}

export async function sendTelegram(text: string, opts: SendOpts = {}): Promise<void> {
  const token = env.telegramBotToken;
  const chatId = opts.chatId ?? env.telegramChatId;
  if (!token || !chatId) {
    activity.push({
      kind: "telegram_out",
      title: "[telegram disabled] would send",
      body: text,
    });
    return;
  }

  const res = await fetch(`${API(token)}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: opts.parseMode ?? "Markdown",
      disable_web_page_preview: opts.disableWebPreview ?? false,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    activity.push({
      kind: "error",
      title: "Telegram sendMessage failed",
      body: `${res.status} ${body}`,
    });
    return;
  }

  activity.push({ kind: "telegram_out", title: "→ user", body: text });
}

export function escapeMd(s: string): string {
  return s.replace(/([_*`\[])/g, "\\$1");
}
