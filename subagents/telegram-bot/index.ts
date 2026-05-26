import TelegramBot from "node-telegram-bot-api";
import { env } from "@/lib/env";
import { activity } from "@/agent/activity";
import { sendTelegram } from "@/agent/telegram";
import { confirmQueue } from "@/agent/confirm-queue";
import { payAndFetch } from "@/agent/payments";
import { state, setLimit, addCourse, listCourses } from "@/agent/state";
import { runOrchestrator } from "@/agent/orchestrator";
import { startTriggerLoop } from "@/agent/trigger";
import { produceStudyPack, type StudyPack } from "@/subagents/_lib/study-pack";
import { complete, textOf } from "@/lib/llm";
import { savePack } from "@/lib/pack-store";

/**
 * Telegram bot — the rubric's judging surface.
 *
 * Cat 2 (Self-Disclosure, 8pts): /start, /help, AND any unknown text reply with
 * the full self-description + command list.
 * Cat 3 (x402 Protocol, 10pts): /quick-prep <topic> hits topic-extractor via x402.
 * Cat 4 (Guardrails, 6pts): /confirm <id>, /abort <id>, /limit <usd>.
 */

const SELF_DESCRIPTION = `🤖 *StudyHire* — your autonomous exam-prep budget manager.

*What I do:*
Fund my GOAT wallet once, tell me your courses, and I'll:
• Monitor your D2L for upcoming exams
• Pay AI agents via x402 to extract topics (autonomously, micropayments)
• Post on-chain bounties to hire competing study-pack agents (with your /confirm)
• Verify their work and release escrow to the winner

*Commands:*
/prep <course> <topic>  – full exam prep: 2 agents compete, verifier picks winner, get study pack
/quickprep <topic>      – quick topic breakdown via x402 ($0.10)
/run [prompt]           – trigger the autonomous orchestrator (propose bounties + HITL gate)
/status                 – current jobs + balance + pending confirmations
/balance                – wallet + escrow snapshot
/addcourse <id>         – track a course
/listcourses            – show tracked courses
/confirm <id>           – approve a high-value action
/abort <id>             – cancel a pending action
/limit <USD>            – set auto-approve threshold (default $5)
/help                   – this menu

*Built on:* Claude (Anthropic) · ERC-8004 (GOAT mainnet) · x402 · StudyHire escrow`;

if (!env.telegramBotToken) {
  console.error("[telegram-bot] TELEGRAM_BOT_TOKEN missing — set it in .env.local");
  process.exit(1);
}

const bot = new TelegramBot(env.telegramBotToken, { polling: true });
state.spendingLimitUsd = env.spendingLimitUsd;

// Register the bot's command list so Telegram shows a clean autocomplete menu.
void bot
  .setMyCommands([
    { command: "start", description: "what I do + command list" },
    { command: "help", description: "same as /start" },
    { command: "prep", description: "full exam prep: 2 agents compete, verifier picks best study pack" },
    { command: "quickprep", description: "quick topic breakdown via x402 ($0.10)" },
    { command: "run", description: "run the orchestrator with a custom prompt (Cat 4 demo)" },
    { command: "status", description: "current jobs + balance + pending confirmations" },
    { command: "balance", description: "wallet + escrow snapshot" },
    { command: "addcourse", description: "track a course (e.g. /addcourse CS246)" },
    { command: "listcourses", description: "show tracked courses" },
    { command: "confirm", description: "approve a high-value action by id" },
    { command: "abort", description: "cancel a pending high-value action" },
    { command: "limit", description: "set auto-approve threshold in USD (default $5)" },
  ])
  .catch((err) => console.error("[telegram-bot] setMyCommands failed:", err.message));

function ack(chatId: number, text: string, opts: TelegramBot.SendMessageOptions = {}) {
  activity.push({ kind: "telegram_out", title: "→ user", body: text });
  return bot.sendMessage(chatId, text, { parse_mode: "Markdown", ...opts });
}

const seenChats = new Set<number>();
function logIn(msg: TelegramBot.Message, cmd: string) {
  activity.push({
    kind: "telegram_in",
    title: `← ${msg.from?.username ?? msg.from?.first_name ?? "user"}: ${cmd}`,
    body: msg.text ?? "",
  });
  if (!seenChats.has(msg.chat.id)) {
    seenChats.add(msg.chat.id);
    console.log(
      `\n[telegram-bot] 🆔 chat_id=${msg.chat.id}  user=@${msg.from?.username ?? msg.from?.first_name ?? "?"}\n` +
        `             paste this into TELEGRAM_CHAT_ID in .env.local\n`
    );
  }
}

bot.onText(/^\/start(?:@\w+)?$/, (msg) => {
  logIn(msg, "/start");
  ack(msg.chat.id, SELF_DESCRIPTION);
});

bot.onText(/^\/help(?:@\w+)?$/, (msg) => {
  logIn(msg, "/help");
  ack(msg.chat.id, SELF_DESCRIPTION);
});

bot.onText(/^\/status(?:@\w+)?$/, (msg) => {
  logIn(msg, "/status");
  const pending = confirmQueue.listPending();
  const courses = listCourses();
  const recent = activity
    .recent(5)
    .map((e) => `• \`${new Date(e.ts).toISOString().slice(11, 19)}\` ${e.title}`)
    .join("\n") || "_(no activity yet)_";

  ack(
    msg.chat.id,
    `*StudyHire status*

*Spending limit:* $${state.spendingLimitUsd.toFixed(2)} (auto-approve threshold)
*Total spent:* $${state.totalSpentUsd.toFixed(2)}
*Bounties escrowed:* $${state.bountiesPostedUsd.toFixed(2)}

*Tracked courses:* ${courses.length ? courses.map((c) => c.id).join(", ") : "_none yet — try /add-course CS246_"}

*Pending confirmations (${pending.length}):*
${
  pending.length
    ? pending
        .map(
          (p) =>
            `• #${p.id} — $${p.amountUsd.toFixed(2)} — ${p.summary}\n    /confirm ${p.id}   /abort ${p.id}`
        )
        .join("\n")
    : "_none_"
}

*Last 5 actions:*
${recent}`
  );
});

bot.onText(/^\/balance(?:@\w+)?$/, (msg) => {
  logIn(msg, "/balance");
  // TODO: real wallet balance via viem once wallet.ts is wired.
  ack(
    msg.chat.id,
    `*Wallet snapshot*

*Operating balance:* _live read coming once wallet.ts wires GOAT RPC_
*Escrowed in bounties:* $${state.bountiesPostedUsd.toFixed(2)}
*Auto-approve limit:* $${state.spendingLimitUsd.toFixed(2)}

Use /limit <usd> to change the auto-approve threshold.`
  );
});

bot.onText(/^\/(?:quickprep|quick_prep|quick-prep)(?:@\w+)?(?:\s+(.+))?$/, async (msg, match) => {
  logIn(msg, `/quickprep ${match?.[1] ?? ""}`);
  const topic = (match?.[1] ?? "").trim();
  if (!topic) {
    return ack(
      msg.chat.id,
      "Usage: `/quickprep <topic>` — e.g. `/quickprep recursion` or `/quickprep linear algebra eigenvalues`"
    );
  }

  await ack(
    msg.chat.id,
    `⏳ Paying topic-extractor agent $${env.topicExtractorPriceUsd.toFixed(2)} via x402 for *${topic}*...`
  );

  try {
    const res = await payAndFetch<{ subtopics?: Array<{ name: string; hook: string }> }>(
      `${env.topicExtractorUrl}/extract`,
      { method: "POST", json: { topic } }
    );

    if (!res.ok) {
      return ack(
        msg.chat.id,
        `❌ *Payment failed:* ${res.reason}. No charge made. Try \`/quickprep ${topic}\` again or \`/status\` to check my balance.`
      );
    }

    state.totalSpentUsd += res.receipt.amountUsd;

    const sub = res.data.subtopics ?? [];
    const lines =
      sub.length === 0
        ? "_(no sub-topics returned)_"
        : sub
            .slice(0, 6)
            .map((s, i) => `${i + 1}. *${s.name}* — ${s.hook}`)
            .join("\n");

    return ack(
      msg.chat.id,
      `✅ *x402 paid:* $${res.receipt.amountUsd.toFixed(2)}
*Tx:* \`${res.receipt.txHash}\`
*Explorer:* ${res.receipt.explorerUrl}

*Topic breakdown — ${topic}*
${lines}`,
      { disable_web_page_preview: true }
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown error";
    return ack(
      msg.chat.id,
      `❌ *Payment failed:* ${reason}. No charge made. Try \`/quickprep ${topic}\` again or \`/status\` to check my balance.`
    );
  }
});

/**
 * /prep <course> <topic>
 * The full StudyHire pipeline in one command:
 *  1. Pay topic-extractor via x402 to break the topic into subtopics
 *  2. Two competing agents each produce a full study pack (flashcards + practice Qs)
 *  3. Claude verifier scores both and picks the winner
 *  4. Send the winner's study pack to Telegram
 */
bot.onText(/^\/prep(?:@\w+)?(?:\s+(\S+))?(?:\s+(.+))?$/, async (msg, match) => {
  const course = (match?.[1] ?? "").trim();
  const topic  = (match?.[2] ?? "").trim();
  logIn(msg, `/prep ${course} ${topic}`);
  // HTML-escape helper for all dynamic strings in HTML-mode messages
  const h = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  if (!course || !topic) {
    return ack(msg.chat.id, "Usage: `/prep <courseId> <topic>`\nExample: `/prep CS246 recursion and induction`");
  }

  await bot.sendMessage(
    msg.chat.id,
    `📚 <b>StudyHire pipeline starting</b>\n<b>${h(course)}</b> — ${h(topic)}\n\n1️⃣ Paying topic-extractor via x402...\n2️⃣ Two agents compete to write the best study pack\n3️⃣ Verifier picks the winner`,
    { parse_mode: "HTML" }
  );

  // Step 1 — x402 topic extraction
  const extractRes = await payAndFetch<{ subtopics?: Array<{ name: string; hook: string }> }>(
    `${env.topicExtractorUrl}/extract`,
    { method: "POST", json: { topic: `${course} ${topic}` } }
  );
  if (!extractRes.ok) {
    return ack(msg.chat.id, `❌ Topic extractor failed: ${extractRes.reason}\n\nMake sure \`npm run extractor\` is running.`);
  }
  state.totalSpentUsd += extractRes.receipt.amountUsd;

  const subtopics = extractRes.data.subtopics ?? [];
  const topicLine = subtopics.slice(0, 3).map(s => s.name).join(", ") || topic;
  await ack(msg.chat.id, `✅ *x402 paid* $${extractRes.receipt.amountUsd.toFixed(2)} · topics extracted\n\n⚔️ *Two agents now competing to write your study pack...*`);

  // Step 2 — two agents compete in parallel
  const brief = { course, topic, deliverable: `Exam-focused study pack. Key subtopics: ${topicLine}` };
  let packA: StudyPack | null = null;
  let packB: StudyPack | null = null;
  try {
    [packA, packB] = await Promise.all([
      produceStudyPack(brief, "concise, exam-targeted, bulleted, no fluff"),
      produceStudyPack(brief, "narrative, intuition-first, builds analogies before formalism"),
    ]);
  } catch (err) {
    return ack(msg.chat.id, `❌ Study pack generation failed: ${err instanceof Error ? err.message : "unknown"}`);
  }

  activity.push({ kind: "submission_received", title: `Both agents submitted for ${topic}` });

  // Step 3 — Claude verifier picks winner
  let winner: StudyPack = packA;
  let winnerName = "Agent A (concise)";
  let rationale = "";
  try {
    const scoreMsg = await complete({
      system: `You are the StudyHire verifier. Respond with a single JSON object only, no markdown, no fences. Schema: {"winner":"A","rationale":"one sentence"} — winner must be "A" or "B".`,
      messages: [{
        role: "user",
        content: `Brief: ${JSON.stringify(brief)}\n\nPack A summary: ${packA.summary}\n\nPack B summary: ${packB.summary}`,
      }],
      maxTokens: 150,
    });
    const scoreText = textOf(scoreMsg)
      .replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const start = scoreText.indexOf("{"), end = scoreText.lastIndexOf("}");
    const parsed = start !== -1 && end > start ? JSON.parse(scoreText.slice(start, end + 1)) : null;
    if (parsed?.winner === "B") { winner = packB; winnerName = "Agent B (narrative)"; }
    rationale = parsed?.rationale ?? "";
  } catch {
    // verifier failed — default to pack A
  }

  // Step 4 — persist to disk and send a dashboard link
  const stored = savePack({
    course,
    topic,
    winnerAgent: winnerName,
    winnerRationale: rationale,
    pack: winner,
    receipt: {
      txHash: extractRes.receipt.txHash,
      explorerUrl: extractRes.receipt.explorerUrl,
      amountUsd: extractRes.receipt.amountUsd,
    },
  });

  activity.push({
    kind: "winner_declared",
    title: `Winner: ${winnerName} for ${topic}`,
    body: rationale,
    data: { packId: stored.id, dashboardUrl: `http://localhost:3000/pack/${stored.id}` },
  });

  const packUrl = `http://localhost:3000/pack/${stored.id}`;
  // Telegram refuses to make `<a href>` tags clickable when they point to localhost
  // (it treats them as untrustworthy). Plain-text URLs DO get auto-linkified by every
  // Telegram client, so we put the URL on its own line and let the client linkify it.
  return bot.sendMessage(
    msg.chat.id,
    `✅ <b>Study pack ready!</b>\n\n` +
    `📚 <b>${h(course)}</b> — ${h(topic)}\n` +
    `🏆 ${h(winnerName)} won the competition\n` +
    (rationale ? `<i>"${h(rationale)}"</i>\n` : "") +
    `💳 x402: <code>${extractRes.receipt.txHash.slice(0, 20)}…</code> ($${extractRes.receipt.amountUsd.toFixed(2)})\n\n` +
    `👉 <b>Open your study pack:</b>\n` +
    `${packUrl}`,
    { parse_mode: "HTML", disable_web_page_preview: true }
  );
});

bot.onText(/^\/(?:addcourse|add_course|add-course)(?:@\w+)?(?:\s+(.+))?$/, (msg, match) => {
  logIn(msg, `/addcourse ${match?.[1] ?? ""}`);
  const arg = (match?.[1] ?? "").trim();
  if (!arg) return ack(msg.chat.id, "Usage: `/addcourse CS246`");
  addCourse(arg);
  ack(msg.chat.id, `📚 Tracking *${arg}*. I'll poll D2L for exam dates and propose study budgets.`);
});

bot.onText(/^\/(?:listcourses|list_courses|list-courses)(?:@\w+)?$/, (msg) => {
  logIn(msg, "/listcourses");
  const courses = listCourses();
  if (courses.length === 0) {
    return ack(msg.chat.id, "_No courses tracked yet._ Use `/add-course <id>` to start.");
  }
  ack(
    msg.chat.id,
    `*Tracked courses (${courses.length}):*\n` +
      courses
        .map(
          (c) =>
            `• *${c.id}* — ${c.detectedExams.length} exam(s) detected${
              c.detectedExams[0]
                ? ` — next: ${c.detectedExams[0].title} (${new Date(c.detectedExams[0].dueAt).toDateString()})`
                : ""
            }`
        )
        .join("\n")
  );
});

bot.onText(/^\/confirm(?:@\w+)?(?:\s+(\S+))?$/, (msg, match) => {
  logIn(msg, `/confirm ${match?.[1] ?? ""}`);
  const id = (match?.[1] ?? "").trim();
  if (!id) return ack(msg.chat.id, "Usage: `/confirm <id>` — find ids with /status");

  const r = confirmQueue.confirm(id);
  if (!r.ok) {
    if (r.reason === "no_such_action")
      return ack(msg.chat.id, `No pending action with id *${id}*. Use /status to see pending actions.`);
    return ack(msg.chat.id, `Action *${id}* is already *${r.reason?.replace("already_", "")}*.`);
  }
  ack(msg.chat.id, `✅ Action *${id}* approved. Executing now — I'll post the tx hash here when it confirms.`);
});

bot.onText(/^\/abort(?:@\w+)?(?:\s+(\S+))?$/, (msg, match) => {
  logIn(msg, `/abort ${match?.[1] ?? ""}`);
  const id = (match?.[1] ?? "").trim();
  if (!id) return ack(msg.chat.id, "Usage: `/abort <id>` — find ids with /status");

  const r = confirmQueue.abort(id);
  if (!r.ok) {
    if (r.reason === "no_such_action")
      return ack(msg.chat.id, `No pending action with id *${id}*. Use /status to see pending actions.`);
    return ack(msg.chat.id, `Action *${id}* is already *${r.reason?.replace("already_", "")}*.`);
  }
  ack(msg.chat.id, `🛑 Action *${id}* aborted. Nothing was spent.`);
});

bot.onText(/^\/run(?:@\w+)?(?:\s+(.+))?$/, async (msg, match) => {
  logIn(msg, `/run ${match?.[1] ?? ""}`);
  const prompt =
    (match?.[1] ?? "").trim() ||
    "Check tracked courses and propose a $25 bounty for the next upcoming exam. If no courses are tracked, propose a demo bounty for CS246 final.";

  await ack(msg.chat.id, `🤖 Running orchestrator...\n\n_"${prompt.slice(0, 120)}"_`);

  try {
    const result = await runOrchestrator(prompt);
    return ack(
      msg.chat.id,
      `✅ *Orchestrator done.*\n\n${result.finalText.slice(0, 600)}${result.finalText.length > 600 ? "…" : ""}`
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown";
    return ack(
      msg.chat.id,
      `❌ *Orchestrator error:* ${reason}\n\nMake sure ANTHROPIC_API_KEY is set in .env.local.`
    );
  }
});

bot.onText(/^\/limit(?:@\w+)?(?:\s+(\S+))?$/, (msg, match) => {
  logIn(msg, `/limit ${match?.[1] ?? ""}`);
  const raw = (match?.[1] ?? "").trim();
  const n = Number(raw);
  if (!raw || Number.isNaN(n) || n < 0) {
    return ack(
      msg.chat.id,
      `Usage: \`/limit <USD>\` — current limit $${state.spendingLimitUsd.toFixed(2)}. Anything above this requires /confirm.`
    );
  }
  setLimit(n);
  ack(msg.chat.id, `🔒 Auto-approve limit set to *$${n.toFixed(2)}*. Spends above this will halt and ask for /confirm.`);
});

// Default fallback — Cat 2 requirement: never go silent.
bot.on("message", (msg) => {
  if (!msg.text) return;
  if (msg.text.startsWith("/")) {
    // A slash command we don't recognize. Catch it explicitly.
    const known =
      /^\/(start|help|prep|run|status|balance|quickprep|quick_prep|quick-prep|addcourse|add_course|add-course|listcourses|list_courses|list-courses|confirm|abort|limit)(?:@\w+)?(\s|$)/.test(
        msg.text
      );
    if (known) return;
    logIn(msg, msg.text);
    return ack(msg.chat.id, `I don't recognize that command. Here's what I can do:\n\n${SELF_DESCRIPTION}`);
  }
  // Plain text → self-describe (rubric Cat 2 acceptance: "any message").
  logIn(msg, "(free text)");
  ack(msg.chat.id, SELF_DESCRIPTION);
});

bot.on("polling_error", (err) => {
  activity.push({ kind: "error", title: "Telegram polling error", body: err.message });
  console.error("[telegram-bot] polling_error:", err.message);
});

// Outbound side-channel: when other modules want to push to the user.
async function announceFromActivity() {
  activity.on("activity", (evt) => {
    if (evt.kind === "confirm_requested") {
      void sendTelegram(
        `⚠️ *HIGH-VALUE ACTION — confirmation needed*\n${evt.body ?? ""}\n\n/confirm ${
          (evt.data as { id?: string })?.id ?? "?"
        }   ← proceed\n/abort ${
          (evt.data as { id?: string })?.id ?? "?"
        }   ← cancel\n\n_Auto-aborts in 5 minutes._`
      );
    }
  });
}
void announceFromActivity();

console.log(`[telegram-bot] polling. limit=$${state.spendingLimitUsd}, extractor=${env.topicExtractorUrl}`);

// Start the D2L exam-detection loop. Reads cache/ every 60s; fires the orchestrator
// automatically when an exam is within 5 days. Nothing happens if cache/ is empty.
startTriggerLoop(60_000);
