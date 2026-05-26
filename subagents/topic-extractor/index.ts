import express from "express";
import { env } from "@/lib/env";
import { complete, textOf } from "@/lib/llm";
import { x402Paywall } from "@/agent/x402-server";

/**
 * Topic-extractor sub-agent. Sits behind the goatx402-sdk-server paywall.
 * Given a `topic` (course area or subject), returns a structured breakdown of
 * the most important sub-topics with a 1-line study hook each.
 *
 * Cat 3 (x402 Protocol Integrity, 10pts) lives here.
 */

const app = express();
app.use(express.json({ limit: "256kb" }));

app.get("/healthz", (_req, res) => {
  res.json({
    ok: true,
    agent: "topic-extractor",
    price_usd: env.topicExtractorPriceUsd,
    mode: env.useMockX402 ? "mock" : "live",
  });
});

app.post("/extract", x402Paywall({ priceUsd: env.topicExtractorPriceUsd, symbol: "USDC" }), async (req, res) => {
  const topic = typeof req.body?.topic === "string" ? req.body.topic.trim() : "";
  if (!topic) return res.status(400).json({ error: "missing 'topic' string in body" });

  try {
    const msg = await complete({
      system:
        "You are StudyHire's topic-extractor sub-agent. You receive a course/subject name and return the 5 most exam-likely sub-topics. Respond ONLY with strict JSON of shape { \"topic\": string, \"subtopics\": [{ \"name\": string, \"hook\": string }] }. The 'hook' is a one-sentence study angle a student can actually use.",
      messages: [{ role: "user", content: `Subject: ${topic}` }],
      maxTokens: 700,
    });

    const text = textOf(msg);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : { topic, subtopics: [], raw: text };
    }

    res.json({
      agent: "topic-extractor",
      paid_usd: env.topicExtractorPriceUsd,
      x402_proof: res.locals.x402Proof ?? null,
      ...((parsed as object) || {}),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown";
    res.status(500).json({ error: "extraction_failed", reason });
  }
});

const port = env.topicExtractorPort;
app.listen(port, () => {
  console.log(
    `[topic-extractor] :${port}  mock=${env.useMockX402}  price=$${env.topicExtractorPriceUsd}  symbol=USDC`
  );
});
