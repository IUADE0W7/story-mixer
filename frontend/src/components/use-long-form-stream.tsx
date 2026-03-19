"use client";

import { useCallback, useRef, useState } from "react";

import {
  buildLongFormRequest,
  parseSseChunk,
  type ChapterOutlineEntry,
  type LongFormRequestPayload,
  type ProviderConfig,
  type StoryDraftInput,
} from "@/lib/story-streaming";

export type StreamStatus =
  | { code: "ready" }
  | { code: "connecting" }
  | { code: "outline_ready" }
  | { code: "writing_chapter"; chapter: number }
  | { code: "revising_chapter"; chapter: number; attempt: number }
  | { code: "complete" }
  | { code: "error" }
  | { code: "backend"; message: string };

export interface AgentLogEntry {
  timestamp: string;
  from: string;
  to: string;
  message: string;
  level: "info" | "warning" | "error";
}

export type ChapterStatus = "pending" | "generating" | "revising" | "complete";

export interface ChapterState {
  outline: ChapterOutlineEntry;
  text: string;
  status: ChapterStatus;
  revisionCount: number;
  accepted: boolean;
  wordCount: number;
}

interface GenerateLongFormArgs {
  draft: StoryDraftInput;
  providerConfig: ProviderConfig;
  chapterCount: number;
  chapterWordTarget: number;
}

interface UseLongFormStreamResult {
  outline: ChapterOutlineEntry[];
  chapters: ChapterState[];
  streamStatus: StreamStatus;
  isStreaming: boolean;
  streamError: string | null;
  agentLog: AgentLogEntry[];
  generateLongForm: (args: GenerateLongFormArgs) => Promise<void>;
  reset: () => void;
}

const ENDPOINT = "/api/v1/stories/generate-long-form";

export function useLongFormStream(): UseLongFormStreamResult {
  const [outline,      setOutline]      = useState<ChapterOutlineEntry[]>([]);
  const [chapters,     setChapters]     = useState<ChapterState[]>([]);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>({ code: "ready" });
  const [isStreaming,  setIsStreaming]  = useState(false);
  const [streamError,  setStreamError]  = useState<string | null>(null);
  const [agentLog,     setAgentLog]     = useState<AgentLogEntry[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setOutline([]);
    setChapters([]);
    setStreamStatus({ code: "ready" });
    setStreamError(null);
    setAgentLog([]);
  }, []);

  const generateLongForm = useCallback(async ({
    draft,
    providerConfig,
    chapterCount,
    chapterWordTarget,
  }: GenerateLongFormArgs): Promise<void> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsStreaming(true);
    setStreamError(null);
    setOutline([]);
    setChapters([]);
    setStreamStatus({ code: "connecting" });
    setAgentLog([]);

    const payload: LongFormRequestPayload = buildLongFormRequest(
      draft,
      providerConfig,
      chapterCount,
      chapterWordTarget,
    );

    try {
      const response = await fetch(ENDPOINT, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
        signal:  controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}.`);
      }
      if (!response.body) {
        throw new Error("No stream body returned by server.");
      }

      const reader  = response.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = "";

      // Track current chapter index for token accumulation
      let currentChapterNum = -1;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        let sep = buffer.indexOf("\n\n");

        while (sep >= 0) {
          const raw   = buffer.slice(0, sep);
          buffer      = buffer.slice(sep + 2);
          const frame = parseSseChunk(raw);

          if (!frame) { sep = buffer.indexOf("\n\n"); continue; }

          if (frame.event === "status") {
            const msg = typeof frame.payload.message === "string"
              ? frame.payload.message.replaceAll("_", " ")
              : "Processing";
            setStreamStatus({ code: "backend", message: msg });
          }

          if (frame.event === "outline") {
            const rawChapters = frame.payload.chapters;
            if (Array.isArray(rawChapters)) {
              const entries = rawChapters as ChapterOutlineEntry[];
              setOutline(entries);
              setChapters(entries.map(o => ({
                outline:       o,
                text:          "",
                status:        "pending",
                revisionCount: 0,
                accepted:      false,
                wordCount:     0,
              })));
            }
            setStreamStatus({ code: "outline_ready" });
          }

          if (frame.event === "chapter_start") {
            const num = typeof frame.payload.number === "number" ? frame.payload.number : -1;
            currentChapterNum = num;
            setStreamStatus({ code: "writing_chapter", chapter: num });
            setChapters(prev => prev.map(c =>
              c.outline.number === num ? { ...c, status: "generating", text: "" } : c
            ));
          }

          if (frame.event === "chapter_token") {
            const num  = typeof frame.payload.chapter === "number" ? frame.payload.chapter : currentChapterNum;
            const text = typeof frame.payload.text    === "string"  ? frame.payload.text   : "";
            if (text) {
              setChapters(prev => prev.map(c =>
                c.outline.number === num
                  ? { ...c, text: c.text + text }
                  : c
              ));
            }
          }

          if (frame.event === "chapter_revision") {
            const num     = typeof frame.payload.chapter === "number" ? frame.payload.chapter : currentChapterNum;
            const attempt = typeof frame.payload.attempt === "number" ? frame.payload.attempt : 1;
            setStreamStatus({ code: "revising_chapter", chapter: num, attempt });
            setChapters(prev => prev.map(c =>
              c.outline.number === num
                ? { ...c, status: "revising", revisionCount: attempt, text: "" }
                : c
            ));
          }

          if (frame.event === "chapter_complete") {
            const num      = typeof frame.payload.number       === "number"  ? frame.payload.number       : currentChapterNum;
            const content  = typeof frame.payload.content      === "string"  ? frame.payload.content      : "";
            const accepted = typeof frame.payload.accepted      === "boolean" ? frame.payload.accepted      : true;
            const revCount = typeof frame.payload.revision_count === "number" ? frame.payload.revision_count : 0;
            const wc       = typeof frame.payload.word_count    === "number"  ? frame.payload.word_count    : 0;
            setChapters(prev => prev.map(c =>
              c.outline.number === num
                ? { ...c, text: content, status: "complete", accepted, revisionCount: revCount, wordCount: wc }
                : c
            ));
          }

          if (frame.event === "complete") {
            setStreamStatus({ code: "complete" });
          }

          if (frame.event === "log") {
            const entry: AgentLogEntry = {
              timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
              from: typeof frame.payload.from === "string" ? frame.payload.from : "Agent",
              to: typeof frame.payload.to === "string" ? frame.payload.to : "Agent",
              message: typeof frame.payload.message === "string" ? frame.payload.message : "",
              level: (frame.payload.level === "warning" || frame.payload.level === "error") ? frame.payload.level : "info",
            };
            const logFn = entry.level === "warning" ? console.warn : entry.level === "error" ? console.error : console.log;
            logFn(`[Agent] ${entry.from} → ${entry.to}: ${entry.message}`);
            setAgentLog((prev) => [...prev, entry]);
          }

          if (frame.event === "error") {
            const msg = typeof frame.payload.user_message === "string"
              ? frame.payload.user_message
              : typeof frame.payload.detail === "string"
              ? frame.payload.detail
              : "Long-form generation failed.";
            throw new Error(msg);
          }

          sep = buffer.indexOf("\n\n");
        }
      }

      setStreamStatus({ code: "complete" });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      const message = err instanceof Error ? err.message : "Streaming failed.";
      setStreamError(message);
      setStreamStatus({ code: "error" });
    } finally {
      setIsStreaming(false);
    }
  }, []);

  return { outline, chapters, streamStatus, isStreaming, streamError, agentLog, generateLongForm, reset };
}
