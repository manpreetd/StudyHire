"use client";

import { useState } from "react";

export function PracticeCard({ q, sketch, n, delay = 0 }: { q: string; sketch: string; n: number; delay?: number }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="rounded-2xl bg-gradient-to-br from-panel to-bg border border-line overflow-hidden card-glow animate-slide-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-wider uppercase text-warn bg-warn/10 px-2 py-1 rounded-md">
            <span className="w-1.5 h-1.5 rounded-full bg-warn" />
            Problem {n}
          </span>
        </div>

        <p className="text-ink text-[15px] leading-relaxed font-medium">{q}</p>

        {sketch && (
          <>
            <button
              onClick={() => setOpen((v) => !v)}
              className="mt-4 inline-flex items-center gap-2 text-xs text-mute hover:text-accent transition-colors group"
            >
              <span
                className="inline-block transition-transform duration-300"
                style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
              >▶</span>
              <span>{open ? "Hide approach hint" : "Show approach hint"}</span>
            </button>

            <div
              className="grid transition-all duration-500 ease-out"
              style={{
                gridTemplateRows: open ? "1fr" : "0fr",
                marginTop: open ? "12px" : "0px",
                opacity: open ? 1 : 0,
              }}
            >
              <div className="overflow-hidden">
                <div className="pt-3 border-t border-line/60">
                  <p className="text-mute text-sm italic leading-relaxed">{sketch}</p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
