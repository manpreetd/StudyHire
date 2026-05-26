import { complete, textOf } from "@/lib/llm";

export interface StudyPack {
  topic: string;
  course: string;
  summary: string;
  flashcards: Array<{ q: string; a: string }>;
  practiceQuestions: Array<{ q: string; sketch: string }>;
}

const SYSTEM = `You are a competing study-pack submitter agent in StudyHire. You produce a focused study pack for a specific course topic. Output STRICT JSON only. Schema:
{
  "topic": string,
  "course": string,
  "summary": string (<= 4 sentences),
  "flashcards": [{ "q": string, "a": string }] (8-12),
  "practiceQuestions": [{ "q": string, "sketch": string }] (3-5)
}`;

export async function produceStudyPack(brief: { course: string; topic: string; deliverable?: string }, flavor: string): Promise<StudyPack> {
  const msg = await complete({
    system: SYSTEM + `\n\nYour style flavor: ${flavor}`,
    messages: [
      {
        role: "user",
        content: `Course: ${brief.course}\nTopic: ${brief.topic}\nDeliverable: ${brief.deliverable ?? "exam-focused study pack"}`,
      },
    ],
    maxTokens: 1200,
  });
  const text = textOf(msg);
  try {
    return JSON.parse(text) as StudyPack;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]) as StudyPack;
    throw new Error("Submitter returned non-JSON content.");
  }
}
