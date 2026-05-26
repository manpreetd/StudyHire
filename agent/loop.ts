import type Anthropic from "@anthropic-ai/sdk";
import { complete, toolCallsOf, textOf, type Tool, type Message } from "@/lib/llm";

export interface ToolHandler {
  name: string;
  description: string;
  input_schema: Tool["input_schema"];
  handler: (input: any) => Promise<unknown> | unknown;
}

export interface RunArgs {
  system: string;
  user: string;
  tools: ToolHandler[];
  maxSteps?: number;
  onStep?: (step: { kind: "text" | "tool"; payload: any }) => void;
}

export interface RunResult {
  finalText: string;
  steps: Array<{ kind: "text" | "tool"; payload: any }>;
}

/**
 * Runs an Anthropic tool-use loop. Tools are local TS functions — this is the
 * StudyHire orchestrator brain, written directly against Claude (not ClawUp).
 */
export async function runAgent(args: RunArgs): Promise<RunResult> {
  const toolDefs: Tool[] = args.tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));
  const handlers = new Map(args.tools.map((t) => [t.name, t.handler] as const));

  const messages: Message[] = [{ role: "user", content: args.user }];
  const steps: RunResult["steps"] = [];
  const maxSteps = args.maxSteps ?? 6;

  for (let step = 0; step < maxSteps; step++) {
    const res = await complete({
      system: args.system,
      messages,
      tools: toolDefs,
      maxTokens: 1024,
    });

    const calls = toolCallsOf(res);
    const text = textOf(res);
    if (text) {
      steps.push({ kind: "text", payload: text });
      args.onStep?.({ kind: "text", payload: text });
    }

    if (res.stop_reason !== "tool_use" || calls.length === 0) {
      return { finalText: text, steps };
    }

    // Push the assistant turn (must include tool_use blocks verbatim).
    messages.push({ role: "assistant", content: res.content });

    // Run each tool, append a single user turn with all tool_results.
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const call of calls) {
      const handler = handlers.get(call.name);
      let resultText: string;
      let isError = false;
      try {
        if (!handler) throw new Error(`Unknown tool: ${call.name}`);
        const out = await handler(call.input);
        resultText = typeof out === "string" ? out : JSON.stringify(out);
        steps.push({ kind: "tool", payload: { name: call.name, input: call.input, output: out } });
        args.onStep?.({ kind: "tool", payload: { name: call.name, input: call.input, output: out } });
      } catch (err) {
        isError = true;
        resultText = err instanceof Error ? err.message : String(err);
        steps.push({ kind: "tool", payload: { name: call.name, input: call.input, error: resultText } });
        args.onStep?.({ kind: "tool", payload: { name: call.name, input: call.input, error: resultText } });
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: call.id,
        content: resultText,
        is_error: isError,
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  return { finalText: "Reached max tool-use steps without final answer.", steps };
}
