"use client";

import { useEffect, useRef, useState } from "react";

type ActivityEvent = {
  id: string;
  ts: number;
  kind: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
};

const KIND_COLOR: Record<string, string> = {
  agent_thought: "text-mute",
  tool_call: "text-accent",
  x402_payment: "text-ok",
  bounty_posted: "text-ok",
  submission_received: "text-ink",
  winner_declared: "text-ok",
  confirm_requested: "text-warn",
  confirm_resolved: "text-ink",
  telegram_in: "text-accent",
  telegram_out: "text-ink",
  error: "text-err",
};

export default function Page() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/agent/status");
    es.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data) as ActivityEvent;
        setEvents((prev) => {
          if (prev.some((p) => p.id === evt.id)) return prev;
          const next = [...prev, evt];
          return next.length > 200 ? next.slice(-200) : next;
        });
      } catch {
        // ignore
      }
    };
    es.onerror = () => {
      // browser will auto-reconnect; nothing to do
    };
    return () => es.close();
  }, []);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [events]);

  return (
    <main className="min-h-screen bg-bg text-ink px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl">StudyHire <span className="text-mute">— visual receipt</span></h1>
        <p className="text-mute text-sm mt-1">
          Judges interact via Telegram. This page just shows what the agent is doing in real time.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <section className="border border-line rounded-lg bg-panel">
          <div className="px-4 py-3 border-b border-line text-mute text-xs uppercase tracking-wide">
            activity stream
          </div>
          <div ref={listRef} className="p-4 max-h-[70vh] overflow-y-auto text-sm space-y-2">
            {events.length === 0 && (
              <div className="text-mute">Waiting for activity… message your Telegram bot to start.</div>
            )}
            {events.map((e) => (
              <div key={e.id} className="flex gap-3">
                <span className="text-mute shrink-0 w-20">
                  {new Date(e.ts).toISOString().slice(11, 19)}
                </span>
                <span className={`shrink-0 w-44 ${KIND_COLOR[e.kind] ?? "text-ink"}`}>{e.kind}</span>
                <span className="text-ink">
                  {e.title}
                  {e.body ? <span className="text-mute"> — {e.body.slice(0, 220)}</span> : null}
                </span>
              </div>
            ))}
          </div>
        </section>

        <aside className="space-y-4">
          <div className="border border-line rounded-lg bg-panel p-4 text-sm">
            <div className="text-mute text-xs uppercase tracking-wide mb-2">how to demo</div>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Open Telegram, message your bot.</li>
              <li>Send <code className="text-accent">/start</code> — see self-description.</li>
              <li>Send <code className="text-accent">/quick-prep recursion</code> — watch x402 tx land here.</li>
              <li>Trigger a bounty proposal — watch <code className="text-warn">confirm_requested</code> appear.</li>
              <li>Reply <code className="text-accent">/confirm &lt;id&gt;</code> on Telegram.</li>
            </ol>
          </div>
          <div className="border border-line rounded-lg bg-panel p-4 text-sm">
            <div className="text-mute text-xs uppercase tracking-wide mb-2">rubric map</div>
            <ul className="space-y-1">
              <li><span className="text-accent">Cat 2</span> — /start self-disclosure</li>
              <li><span className="text-ok">Cat 3</span> — /quick-prep x402 payment</li>
              <li><span className="text-warn">Cat 4</span> — /confirm gate over $5</li>
              <li><span className="text-ink">Cat 1</span> — 5% take-rate pitch</li>
            </ul>
          </div>
        </aside>
      </div>
    </main>
  );
}
