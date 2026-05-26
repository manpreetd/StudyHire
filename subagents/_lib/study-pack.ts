import { complete, textOf } from "@/lib/llm";

export interface StudyPack {
  topic: string;
  course: string;
  summary: string;
  flashcards: Array<{ q: string; a: string }>;
  practiceQuestions: Array<{ q: string; sketch: string }>;
}

const SYSTEM = `You are a competing study-pack agent in StudyHire. Respond with a single JSON object and nothing else — no markdown, no code fences, no explanation before or after. The response must start with { and end with }.

JSON schema:
{
  "topic": "<string>",
  "course": "<string>",
  "summary": "<string, 3-4 sentences>",
  "flashcards": [{ "q": "<string>", "a": "<string>" }],
  "practiceQuestions": [{ "q": "<string>", "sketch": "<string>" }]
}

Produce 6 flashcards and 3 practice questions. Keep each flashcard answer under 2 sentences. Keep each practice question hint under 2 sentences.`;

/**
 * Strips markdown code fences and extracts the first complete JSON object from text.
 * Handles: raw JSON, ```json...```, text before/after the object.
 */
function extractJson(raw: string): string {
  // 1. Strip markdown code fences
  let text = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  // 2. Find the first { and last } — grab everything between them
  const start = text.indexOf("{");
  const end   = text.lastIndexOf("}");
  if (start === -1) throw new Error("No JSON object found in response");
  if (end === -1 || end < start) {
    // Truncated — try to close open arrays/objects
    text = text.slice(start);
    text = closeJson(text);
    return text;
  }
  return text.slice(start, end + 1);
}

/**
 * Best-effort closer for truncated JSON: counts unclosed brackets/braces and appends them.
 */
function closeJson(partial: string): string {
  const stack: string[] = [];
  let inString = false;
  let escape = false;
  for (const ch of partial) {
    if (escape)           { escape = false; continue; }
    if (ch === "\\")      { escape = true;  continue; }
    if (ch === '"')       { inString = !inString; continue; }
    if (inString)         continue;
    if (ch === "{" || ch === "[") stack.push(ch);
    if (ch === "}" || ch === "]") stack.pop();
  }
  // Close anything still open, innermost first
  let suffix = "";
  for (let i = stack.length - 1; i >= 0; i--) {
    suffix += stack[i] === "[" ? "]" : "}";
  }
  return partial + suffix;
}

export async function produceStudyPack(
  brief: { course: string; topic: string; deliverable?: string },
  flavor: string
): Promise<StudyPack> {
  const msg = await complete({
    system: `${SYSTEM}\n\nStyle flavor: ${flavor}`,
    messages: [
      {
        role: "user",
        content: `Course: ${brief.course}\nTopic: ${brief.topic}\nDeliverable: ${brief.deliverable ?? "exam-focused study pack"}`,
      },
    ],
    maxTokens: 2000,
  });

  const raw = textOf(msg);

  let parsed: StudyPack;
  try {
    parsed = JSON.parse(extractJson(raw)) as StudyPack;
  } catch (e) {
    throw new Error(`Study pack JSON parse failed: ${(e as Error).message}\n\nRaw (first 300 chars): ${raw.slice(0, 300)}`);
  }

  // Ensure required arrays exist even if Claude omitted them
  parsed.flashcards        = parsed.flashcards        ?? [];
  parsed.practiceQuestions = parsed.practiceQuestions ?? [];
  parsed.summary           = parsed.summary           ?? "";
  parsed.topic             = parsed.topic             ?? brief.topic;
  parsed.course            = parsed.course            ?? brief.course;

  return parsed;
}
