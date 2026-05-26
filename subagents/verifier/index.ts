import express from "express";
import { env } from "@/lib/env";
import { complete, textOf } from "@/lib/llm";
import { activity } from "@/agent/activity";

/**
 * Verifier — scores submissions with Claude, picks a winner, and (when chain
 * deployment is wired) signs declareWinner on StudyHire.sol.
 */

interface Submission {
  agent: string;
  pack: unknown;
}

const SYSTEM = `You are the StudyHire verifier. You score competing study packs for the same brief.
Return STRICT JSON:
{
  "scores": [{ "agent": string, "score": number (0-10), "rationale": string }],
  "winner": string (one of the agent names),
  "rationale": string
}
Reward: factual accuracy, exam relevance, density of useful content. Penalize: filler, hallucination, vague rephrasing.`;

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/healthz", (_req, res) => res.json({ ok: true, agent: "verifier" }));

app.post("/score", async (req, res) => {
  const brief = req.body?.brief;
  const submissions: Submission[] = req.body?.submissions ?? [];
  if (!brief || submissions.length === 0)
    return res.status(400).json({ error: "missing brief or submissions" });

  try {
    const msg = await complete({
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Brief: ${JSON.stringify(brief)}\n\nSubmissions:\n${JSON.stringify(submissions, null, 2)}`,
        },
      ],
      maxTokens: 1000,
    });

    const text = textOf(msg);
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : { winner: submissions[0].agent, scores: [], rationale: text };
    }

    activity.push({
      kind: "winner_declared",
      title: `Verifier picked ${parsed.winner}`,
      body: parsed.rationale,
      data: parsed,
    });

    // TODO: when env.studyBountyAddress and env.useMockChain=false, also send
    // the declareWinner tx here. Skipping for the mock demo path.
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: "score_failed", reason: err instanceof Error ? err.message : "unknown" });
  }
});

app.listen(env.verifierPort, () => {
  console.log(`[verifier] listening on :${env.verifierPort}`);
});
