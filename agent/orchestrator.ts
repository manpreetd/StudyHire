import { env } from "@/lib/env";
import { runAgent, type ToolHandler } from "./loop";
import { confirmQueue } from "./confirm-queue";
import { postBounty } from "./bounty-client";
import { payAndFetch } from "./payments";
import { state, listCourses } from "./state";
import { activity } from "./activity";

/**
 * Orchestrator — the Claude-powered brain that decides when to spend.
 *
 * Replaces the original ClawUp deployment from the plan: same job, but written
 * directly against the Anthropic SDK using a tool-use loop ([[feedback-clawup-to-claude]]).
 *
 * Autonomy rule (rubric Cat 4):
 *   - actions <= state.spendingLimitUsd run autonomously
 *   - actions > state.spendingLimitUsd halt and prompt /confirm <id> on Telegram
 */

const SYSTEM = `You are the StudyHire orchestrator. You are autonomous within a USD spending limit. You decide when to:
1. Spend small amounts via x402 micropayments (always allowed up to the limit, no confirmation).
2. Post on-chain bounties (above limit → must request user confirmation through the confirmation queue tool).

Be concise. Always finish by summarizing what you did and the next step.`;

const tools: ToolHandler[] = [
  {
    name: "list_tracked_courses",
    description: "Return the courses the user has asked StudyHire to monitor, plus any detected exams.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    handler: () => ({
      spendingLimitUsd: state.spendingLimitUsd,
      courses: listCourses().map((c) => ({ id: c.id, name: c.name, exams: c.detectedExams })),
    }),
  },
  {
    name: "x402_extract_topics",
    description:
      "Pay the topic-extractor sub-agent via x402 to break a subject into 5 exam-likely sub-topics. Costs ~$0.10. Always allowed (under spending limit).",
    input_schema: {
      type: "object",
      properties: { topic: { type: "string", description: "Course area or subject name" } },
      required: ["topic"],
      additionalProperties: false,
    },
    handler: async ({ topic }: { topic: string }) => {
      const res = await payAndFetch<{ subtopics?: Array<{ name: string; hook: string }> }>(
        `${env.topicExtractorUrl}/extract`,
        { method: "POST", json: { topic } }
      );
      if (!res.ok) return { ok: false, error: res.reason };
      state.totalSpentUsd += res.receipt.amountUsd;
      return { ok: true, receipt: res.receipt, subtopics: res.data.subtopics ?? [] };
    },
  },
  {
    name: "propose_bounty",
    description:
      "Propose an on-chain bounty for a study pack. If amount > spending limit, the user must /confirm in Telegram before it executes. Returns once confirmed/aborted/timed-out.",
    input_schema: {
      type: "object",
      properties: {
        course: { type: "string" },
        topic: { type: "string" },
        amountUsd: { type: "number" },
        deadlineHours: { type: "number", description: "Submission deadline in hours from now" },
        deliverable: { type: "string", description: "What the submitter agent must produce" },
      },
      required: ["course", "topic", "amountUsd", "deadlineHours", "deliverable"],
      additionalProperties: false,
    },
    handler: async (args: { course: string; topic: string; amountUsd: number; deadlineHours: number; deliverable: string }) => {
      const brief = { course: args.course, topic: args.topic, deliverable: args.deliverable };

      if (args.amountUsd <= state.spendingLimitUsd) {
        const r = await postBounty({ amountUsd: args.amountUsd, deadlineSec: args.deadlineHours * 3600, brief });
        state.bountiesPostedUsd += args.amountUsd;
        return { autonomous: true, ...r };
      }

      const { id, awaiting } = confirmQueue.enqueue({
        amountUsd: args.amountUsd,
        kind: "bounty",
        summary: `Post $${args.amountUsd.toFixed(2)} bounty for "${args.topic}" (${args.course}). Deadline ${args.deadlineHours}h. Exceeds $${state.spendingLimitUsd} limit.`,
        data: { brief, deadlineHours: args.deadlineHours },
      });

      const status = await awaiting;
      if (status !== "approved") return { autonomous: false, id, status };

      const r = await postBounty({ amountUsd: args.amountUsd, deadlineSec: args.deadlineHours * 3600, brief });
      if (r.ok) state.bountiesPostedUsd += args.amountUsd;
      return { autonomous: false, id, status, ...r };
    },
  },
];

export async function runOrchestrator(userPrompt: string) {
  activity.push({ kind: "agent_thought", title: "Orchestrator received task", body: userPrompt });
  const result = await runAgent({
    system: SYSTEM,
    user: userPrompt,
    tools,
    maxSteps: 6,
    onStep: (s) => {
      if (s.kind === "text") activity.push({ kind: "agent_thought", title: "Orchestrator", body: s.payload as string });
      else activity.push({ kind: "tool_call", title: `tool: ${(s.payload as any).name}`, data: s.payload as Record<string, unknown> });
    },
  });
  return result;
}

// CLI entry: `npm run orchestrator -- "post a $25 bounty for CS246 final"`
if (process.argv[1]?.endsWith("orchestrator.ts")) {
  const prompt = process.argv.slice(2).join(" ") || "Check tracked courses and propose any bounties that should be posted.";
  runOrchestrator(prompt)
    .then((r) => {
      console.log("\n--- final ---");
      console.log(r.finalText);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
