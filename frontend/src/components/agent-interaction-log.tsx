"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/lib/language-context";
import type { AgentLogEntry } from "./use-long-form-stream";

const AGENT_COLORS: Record<string, string> = {
  Orchestrator: "#14B8A6",
  LLM:          "#A78BFA",
  Judge:        "#F59E0B",
  Critic:       "#F59E0B",
  OutlineAgent: "#60A5FA",
  PromptBuilder:"#34D399",
};

const LEVEL_COLORS: Record<AgentLogEntry["level"], string> = {
  info:    "var(--cream-faint)",
  warning: "#F59E0B",
  error:   "#EF4444",
};

function agentColor(name: string): string {
  return AGENT_COLORS[name] ?? "var(--cream-muted)";
}

interface AgentInteractionLogProps {
  entries: AgentLogEntry[];
}

export function AgentInteractionLog({ entries }: AgentInteractionLogProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-open when first entry arrives
  useEffect(() => {
    if (entries.length > 0 && !open) {
      setOpen(true);
    }
  }, [entries.length > 0]);

  // Auto-scroll to latest entry
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries.length, open]);

  return (
    <div
      className="rounded-xl lf-panel"
      style={{
        background: "var(--surface-raised)",
        border: "1px solid var(--border)",
      }}
    >
      {/* Header / toggle */}
      <button
        type="button"
        className="w-full flex items-center justify-between px-5 py-3 gap-3"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="agent-log-body"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Animated dot when entries are incoming */}
          <span
            className="shrink-0 h-2 w-2 rounded-full"
            style={{
              background: entries.length > 0 ? "#14B8A6" : "var(--border-bright)",
              boxShadow: entries.length > 0 ? "0 0 6px #14B8A6" : "none",
            }}
            aria-hidden
          />
          <span
            className="lf-section-label"
            style={{ color: "var(--teal)" }}
          >
            {t("ui.agentLog.title")}
          </span>
          {entries.length > 0 && (
            <span
              className="px-1.5 py-0.5 rounded text-xs"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "9px",
                background: "var(--surface-high)",
                color: "var(--teal)",
                border: "1px solid var(--border-bright)",
                letterSpacing: "0.08em",
              }}
            >
              {entries.length}
            </span>
          )}
        </div>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden
          style={{
            color: "var(--cream-faint)",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease",
            flexShrink: 0,
          }}
        >
          <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Body */}
      {open && (
        <div
          id="agent-log-body"
          ref={scrollRef}
          className="px-4 pb-4 max-h-[520px] overflow-y-auto"
          aria-live="polite"
          aria-label="Agent interaction log entries"
        >
          <div className="min-h-full flex flex-col justify-end">
          {entries.length === 0 ? (
            <p
              className="text-center py-6"
              style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--cream-faint)" }}
            >
              {t("ui.agentLog.empty")}
            </p>
          ) : (
            <div className="space-y-1">
            {entries.map((entry, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2.5 py-1.5"
                style={{
                  borderBottom: idx < entries.length - 1 ? "1px solid var(--border)" : "none",
                }}
              >
                {/* Timestamp */}
                <span
                  className="shrink-0 tabular-nums"
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "9px",
                    color: "var(--cream-faint)",
                    opacity: 0.6,
                    paddingTop: "1px",
                    minWidth: "6ch",
                  }}
                >
                  {entry.timestamp}
                </span>

                {/* From → To badges */}
                <div className="flex items-center gap-1 shrink-0 flex-wrap" style={{ paddingTop: "1px" }}>
                  <span
                    className="px-1.5 py-0.5 rounded text-xs"
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "9px",
                      color: agentColor(entry.from),
                      background: `${agentColor(entry.from)}18`,
                      border: `1px solid ${agentColor(entry.from)}40`,
                      letterSpacing: "0.06em",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {entry.from}
                  </span>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden style={{ flexShrink: 0, color: "var(--cream-faint)", opacity: 0.5 }}>
                    <path d="M1 5H9M6 2L9 5L6 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span
                    className="px-1.5 py-0.5 rounded text-xs"
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "9px",
                      color: agentColor(entry.to),
                      background: `${agentColor(entry.to)}18`,
                      border: `1px solid ${agentColor(entry.to)}40`,
                      letterSpacing: "0.06em",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {entry.to}
                  </span>
                </div>

                {/* Message */}
                <p
                  className="text-xs leading-5 min-w-0"
                  style={{
                    fontFamily: "var(--font-mono)",
                    color: LEVEL_COLORS[entry.level],
                    wordBreak: "break-word",
                  }}
                >
                  {entry.message}
                </p>
              </div>
            ))}
            </div>
          )}
          </div>
        </div>
      )}
    </div>
  );
}
