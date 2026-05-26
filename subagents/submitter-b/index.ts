import express from "express";
import { env } from "@/lib/env";
import { activity } from "@/agent/activity";
import { produceStudyPack } from "../_lib/study-pack";

/**
 * Submitter B — "narrative, intuition-building" style. Competes with submitter-a
 * for the same bounty. Verifier picks the winner.
 */
const app = express();
app.use(express.json({ limit: "256kb" }));

app.get("/healthz", (_req, res) => res.json({ ok: true, agent: "submitter-b", style: "narrative" }));

app.post("/produce", async (req, res) => {
  const brief = req.body?.brief;
  if (!brief?.course || !brief?.topic) return res.status(400).json({ error: "missing brief.course/topic" });
  try {
    const pack = await produceStudyPack(brief, "narrative, intuition-first, builds analogies before formalism");
    activity.push({ kind: "submission_received", title: `Submitter B produced pack for ${brief.topic}` });
    res.json({ agent: "submitter-b", pack });
  } catch (err) {
    res.status(500).json({ error: "produce_failed", reason: err instanceof Error ? err.message : "unknown" });
  }
});

app.listen(env.submitterBPort, () => {
  console.log(`[submitter-b] listening on :${env.submitterBPort}`);
});
