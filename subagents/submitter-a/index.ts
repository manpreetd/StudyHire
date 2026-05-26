import express from "express";
import { env } from "@/lib/env";
import { activity } from "@/agent/activity";
import { produceStudyPack } from "../_lib/study-pack";

/**
 * Submitter A — "concise and structured" study packs. Listens for bounty posts and
 * exposes a /submit endpoint for the orchestrator (or a watcher) to invoke. In a
 * fuller implementation it would watch contract events directly; for the hackathon
 * demo we keep it HTTP-driven so the orchestrator can sequence things explicitly.
 */
const app = express();
app.use(express.json({ limit: "256kb" }));

app.get("/healthz", (_req, res) => res.json({ ok: true, agent: "submitter-a", style: "concise" }));

app.post("/produce", async (req, res) => {
  const brief = req.body?.brief;
  if (!brief?.course || !brief?.topic) return res.status(400).json({ error: "missing brief.course/topic" });
  try {
    const pack = await produceStudyPack(brief, "concise, exam-targeted, bulleted, no fluff");
    activity.push({ kind: "submission_received", title: `Submitter A produced pack for ${brief.topic}` });
    res.json({ agent: "submitter-a", pack });
  } catch (err) {
    res.status(500).json({ error: "produce_failed", reason: err instanceof Error ? err.message : "unknown" });
  }
});

app.listen(env.submitterAPort, () => {
  console.log(`[submitter-a] listening on :${env.submitterAPort}`);
});
