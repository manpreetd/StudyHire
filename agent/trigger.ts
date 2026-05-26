import { activity } from "./activity";
import { state } from "./state";
import { loadAll } from "@/ingest/loader";
import { runOrchestrator } from "./orchestrator";

/**
 * Exam-detection trigger. Periodically scans the D2L cache for exams in the
 * next N days. For each newly detected upcoming exam, asks the orchestrator
 * to "consider posting a bounty" — the orchestrator's tool-use loop then
 * either proceeds autonomously or queues a confirmation request.
 */

const WINDOW_DAYS = 5;

const triggered = new Set<string>(); // courseId+title to dedupe

export async function tickOnce(): Promise<void> {
  const now = Date.now();
  const cutoff = now + WINDOW_DAYS * 24 * 3600 * 1000;
  const courses = loadAll();

  for (const c of courses) {
    for (const exam of c.exams) {
      if (exam.dueAt > cutoff || exam.dueAt < now) continue;
      const key = `${c.courseId}::${exam.title}`;
      if (triggered.has(key)) continue;
      triggered.add(key);

      activity.push({
        kind: "agent_thought",
        title: `Detected upcoming exam: ${exam.title}`,
        body: `Due in ${Math.round((exam.dueAt - now) / 86400_000)}d. Topics: ${exam.topics.join(", ")}`,
      });

      // Pre-stage in state so /list-courses surfaces it.
      const cs = state.courses.get(c.courseId);
      if (cs) cs.detectedExams.push({ title: exam.title, dueAt: exam.dueAt });

      // Hand off to Claude orchestrator.
      void runOrchestrator(
        `An exam is approaching for course ${c.courseId} (${c.name}). Exam: "${exam.title}", due ${new Date(
          exam.dueAt
        ).toISOString()}. Likely topics: ${exam.topics.join(", ")}. Decide whether to post a study-pack bounty, choose a sensible USD amount, and either proceed autonomously (under $${state.spendingLimitUsd}) or request user confirmation.`
      ).catch((err) => {
        activity.push({ kind: "error", title: "Orchestrator failed", body: err?.message ?? String(err) });
      });
    }
  }
}

let timer: NodeJS.Timeout | undefined;
export function startTriggerLoop(intervalMs = 60_000) {
  if (timer) return;
  timer = setInterval(() => void tickOnce(), intervalMs);
  void tickOnce();
}

if (process.argv[1]?.endsWith("trigger.ts")) {
  startTriggerLoop(30_000);
  console.log("[trigger] watching cache/ every 30s. Ctrl-C to stop.");
}
