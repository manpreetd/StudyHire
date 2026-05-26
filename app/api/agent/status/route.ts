import { activity, type ActivityEvent } from "@/agent/activity";

export const dynamic = "force-dynamic";

export async function GET() {
  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const send = (evt: ActivityEvent) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify(evt)}\n\n`));

      // Replay recent events on connect so a fresh tab has context.
      for (const e of activity.recent(50)) send(e);

      const onActivity = (e: ActivityEvent) => send(e);
      activity.on("activity", onActivity);

      const ping = setInterval(() => controller.enqueue(enc.encode(": ping\n\n")), 20_000);

      return () => {
        clearInterval(ping);
        activity.off("activity", onActivity);
      };
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
