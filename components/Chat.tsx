"use client";

import { useEffect, useRef, useState } from "react";
import { useAttachmentPicker } from "./chat/useAttachmentPicker";
import TurnstileGate from "./chat/TurnstileGate";
import SkillsPanel from "./chat/SkillsPanel";
import ProjectPicker from "./chat/ProjectPicker";
import BuildZipBar from "./chat/BuildZipBar";
import Markdown from "./chat/Markdown";
import { buildMessageContent, type Attachment } from "@/lib/attachments";
import { loadSkills, skillsToSystem, type Skill } from "@/lib/skills";
import { loadProjects, projectSystem, type Project } from "@/lib/projects";
import Link from "next/link";
import { baseModels, premiumModels, modelsByBrand, type ModelConfig } from "@/lib/models";

interface Msg {
  role: "user" | "assistant";
  content: string;
  modelName?: string;
}

interface ChatThread {
  id: string;
  title: string;
  modelId: string;
  messages: Msg[];
  updatedAt: number;
  /**
   * Which project this chat belongs to, if any.
   *
   * Optional because every chat saved before this existed has no value —
   * those stay unfiled rather than being guessed into a project.
   */
  projectId?: string | null;
}

type Blocker = { code: string; message: string; requiredPlan?: string } | null;

const STORE_KEY = "cfai_chats";

function deviceId() {
  if (typeof window === "undefined") return null;
  let id = localStorage.getItem("cfai_device");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("cfai_device", id);
  }
  return id;
}

function loadChats(): ChatThread[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveChats(chats: ChatThread[]) {
  try {
    // cap stored history so localStorage never overflows
    localStorage.setItem(STORE_KEY, JSON.stringify(chats.slice(0, 50)));
  } catch {
    /* storage full or unavailable — history just won't persist */
  }
}

const LockIcon = ({ className = "" }: { className?: string }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={className} aria-hidden>
    <rect x="4" y="10" width="16" height="11" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </svg>
);

export default function Chat() {
  const [chats, setChats] = useState<ChatThread[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeModelId, setActiveModelId] = useState("chatgpt");
  const [hydrated, setHydrated] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [blocker, setBlocker] = useState<Blocker>(null);

  /* --- composer features --- */
  const [features, setFeatures] = useState<{
    tier: string; label: string; paid: boolean; signedIn: boolean;
    webSearch: boolean; webSearchDaily: number;
    research: boolean; researchDaily: number;
    dailyCredits: number; signedInDailyCredits: number; unlimitedModels: string[];
    attachments: boolean; maxAttachments: number; maxAttachmentMb: number; imageAttachments: boolean; pdfAttachments: boolean; zipAttachments: boolean;
    skills: boolean; maxSkills: number;
    projects: boolean; maxProjects: number;
  } | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [webSearch, setWebSearch] = useState(false);
  const [research, setResearch] = useState(false);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [activeSkillIds, setActiveSkillIds] = useState<string[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [panel, setPanel] = useState<"none" | "skills" | "projects">("none");
  const [plusOpen, setPlusOpen] = useState(false);

  /* Bot check. `pendingTurn` holds the exchange the server refused, so solving
     the challenge resumes it instead of making the user retype. */
  const [challenge, setChallenge] = useState<{ siteKey: string } | null>(null);
  const pendingTurn = useRef<{ chatId: string; history: Msg[] } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  async function copyReply(index: number, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 1600);
    } catch {
      /* clipboard blocked — the per-code-block button still works */
    }
  }
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const picker = useAttachmentPicker({
    attachments,
    onChange: setAttachments,
    maxCount: features?.maxAttachments ?? 0,
    maxMb: features?.maxAttachmentMb ?? 0,
    allowImages: features?.imageAttachments ?? false,
    allowPdf: features?.pdfAttachments ?? false,
    allowZip: features?.zipAttachments ?? false,
  });

  useEffect(() => {
    fetch("/api/chat").then((r) => r.json()).then(setFeatures).catch(() => {});
    // Reading the browser's own state on mount — localStorage, the URL, the
    // server's feature flags. That has to happen after mount or the server's
    // HTML and the client's first render disagree, and this rule can't tell a
    // one-shot external read from a render loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSkills(loadSkills());
    setProjects(loadProjects());
  }, []);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const all: ModelConfig[] = [...baseModels, ...premiumModels];
  const activeModel = all.find((m) => m.id === activeModelId)!;
  const activeChat = chats.find((c) => c.id === activeChatId) ?? null;
  const messages = activeChat?.messages ?? [];

  /* ---- hydration: load saved chats once on mount ---- */
  useEffect(() => {
    const stored = loadChats();
    // Reading the browser's own state on mount — localStorage, the URL, the
    // server's feature flags. That has to happen after mount or the server's
    // HTML and the client's first render disagree, and this rule can't tell a
    // one-shot external read from a render loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChats(stored);
    setHydrated(true);
  }, []);

  /* ---- persist whenever chats change (after hydration) ---- */
  useEffect(() => {
    if (hydrated) saveChats(chats);
  }, [chats, hydrated]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // fullscreen: Esc to exit, lock page scroll behind the overlay
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    document.documentElement.classList.add("chat-fullscreen");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      document.documentElement.classList.remove("chat-fullscreen");
    };
  }, [fullscreen]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [pickerOpen]);

  function newChat() {
    setAttachments([]);
    setActiveChatId(null);
    setBlocker(null);
    setSidebarOpen(false);
    inputRef.current?.focus();
  }

  function openChat(id: string) {
    const chat = chats.find((c) => c.id === id);
    if (!chat) return;
    setActiveChatId(id);
    setActiveModelId(chat.modelId);
    setBlocker(null);
    setSidebarOpen(false);
  }

  function deleteChat(id: string) {
    setChats((prev) => prev.filter((c) => c.id !== id));
    if (activeChatId === id) setActiveChatId(null);
  }

  function pickModel(id: string) {
    setActiveModelId(id);
    // remember the model on the open thread too
    if (activeChatId) {
      setChats((prev) => prev.map((c) => (c.id === activeChatId ? { ...c, modelId: id } : c)));
    }
    setPickerOpen(false);
    inputRef.current?.focus();
  }

  function upsertMessages(chatId: string, updater: (msgs: Msg[]) => Msg[]) {
    setChats((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, messages: updater(c.messages), updatedAt: Date.now() } : c)),
    );
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;

    // create a thread on first message
    let chatId = activeChatId;
    if (!chatId) {
      chatId = crypto.randomUUID();
      const title = text.length > 42 ? text.slice(0, 42) + "…" : text;
      setChats((prev) => [
        // stamp the project at creation: which project a chat belongs to is
        // decided when it starts, not retroactively
        { id: chatId!, title, modelId: activeModelId, messages: [], updatedAt: Date.now(), projectId: activeProjectId },
        ...prev,
      ]);
      setActiveChatId(chatId);
    }

    setInput("");
    await runTurn(chatId, [...messages, { role: "user", content: text }]);
  }

  /** Stop a reply in flight. The partial text is kept — it was paid for. */
  function stop() {
    abortRef.current?.abort();
  }

  /** Re-answer the last user message, discarding the reply we got. */
  async function regenerate() {
    if (busy || !activeChatId) return;
    const lastUser = [...messages].reverse().findIndex((m) => m.role === "user");
    if (lastUser === -1) return;
    const cut = messages.length - lastUser; // keep through that user message
    await runTurn(activeChatId, messages.slice(0, cut));
  }

  /**
   * Replace a user message and answer again from that point.
   * Everything after it is dropped, because those turns were replies to a
   * question that no longer exists.
   */
  async function saveEdit(index: number) {
    const text = editDraft.trim();
    setEditingIndex(null);
    if (!text || busy || !activeChatId) return;
    await runTurn(activeChatId, [...messages.slice(0, index), { role: "user", content: text }]);
  }

  /**
   * Run one exchange: post `history`, stream the reply into the thread.
   * Shared by send, regenerate and edit so all three behave identically —
   * same billing, same error handling, same abort behaviour.
   */
  async function runTurn(chatId: string, history: Msg[], turnstileToken?: string) {
    upsertMessages(chatId, () => [...history, { role: "assistant", content: "", modelName: activeModel.name }]);
    setBusy(true);
    setBlocker(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // The newest message carries any attachments; earlier turns stay plain
      // text so we never re-send an image on every follow-up.
      const outgoing = history.map(({ role, content }, i) =>
        i === history.length - 1 && attachments.length
          ? { role, content: buildMessageContent(content, attachments) }
          : { role, content },
      );

      const activeSkills = skills.filter((sk) => activeSkillIds.includes(sk.id));
      const project = projects.find((p) => p.id === activeProjectId) ?? null;
      const system = [projectSystem(project), skillsToSystem(activeSkills)].filter(Boolean).join("\n\n");

      const res = await fetch("/api/chat", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: activeModelId,
          messages: outgoing,
          deviceId: deviceId(),
          ...(webSearch || research ? { webSearch: true } : {}),
          ...(research ? { research: true } : {}),
          ...(system ? { system } : {}),
          ...(turnstileToken ? { turnstileToken } : {}),
        }),
      });

      if (res.status === 403) {
        const data = await res.clone().json().catch(() => null);
        if (data?.turnstile && data?.siteKey) {
          // keep the exchange so it can resume once the check passes
          pendingTurn.current = { chatId, history };
          setChallenge({ siteKey: data.siteKey });
          upsertMessages(chatId, (msgs) =>
            msgs.filter((m, i) => !(i === msgs.length - 1 && m.role === "assistant" && !m.content)),
          );
          return;
        }
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Something went wrong." }));
        setBlocker({ code: err.error, message: err.message, requiredPlan: err.requiredPlan });
        upsertMessages(chatId, () => history); // drop the empty assistant stub
        return;
      }

      const reader = res.body!.getReader();
      const FLUSH_MS = 60;
      let pending = "";
      let lastFlush = 0;
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") continue;
          try {
            const json = JSON.parse(payload);
            if (json.delta) {
              // Buffer deltas instead of committing each one. Every commit
              // re-renders and re-parses the whole reply as markdown, so
              // token-by-token updates made long answers stutter. Flushing on
              // an interval caps that work without the text looking choppy.
              pending += json.delta;
              const now = Date.now();
              if (now - lastFlush >= FLUSH_MS) {
                const chunk = pending;
                pending = "";
                lastFlush = now;
                upsertMessages(chatId, (msgs) => {
                  const copy = [...msgs];
                  copy[copy.length - 1] = { ...copy[copy.length - 1], content: copy[copy.length - 1].content + chunk };
                  return copy;
                });
              }
            }
          } catch {
            /* partial frame */
          }
        }
      }
      // commit anything still buffered, or the tail of the reply is lost
      if (pending) {
        const rest = pending;
        pending = "";
        upsertMessages(chatId, (msgs) => {
          const copy = [...msgs];
          copy[copy.length - 1] = { ...copy[copy.length - 1], content: copy[copy.length - 1].content + rest };
          return copy;
        });
      }
    } catch (err) {
      // Pressing Stop rejects the fetch — that is expected, not an error, and
      // whatever already streamed stays on screen because it was paid for.
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setBlocker({ code: "network", message: "Connection lost. Please try again." });
      }
      upsertMessages(chatId, (msgs) => msgs.filter((m, i) => !(i === msgs.length - 1 && m.role === "assistant" && !m.content)));
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  function ModelRow({ m }: { m: ModelConfig }) {
    const isActive = m.id === activeModelId;
    return (
      <button
        onClick={() => pickModel(m.id)}
        className={`flex w-full items-center justify-between gap-3 rounded-lg py-2 pl-4 pr-3 text-left transition-colors ${
          isActive ? "bg-brand-tint" : "hover:bg-canvas"
        }`}
      >
        <span className="min-w-0">
          <span className={`block truncate text-[14px] font-medium ${isActive ? "text-brand-deep" : "text-ink"}`}>
            {m.version}
          </span>
          <span className="block truncate text-[12px] text-ink-faint">{m.strength}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {m.minPlan === "free" ? (
            <span className="rounded-full bg-mint-tint px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-mint">
              Free
            </span>
          ) : (
            <LockIcon className="text-ink-faint" />
          )}
          {isActive && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-brand" aria-hidden>
              <path d="M20 6L9 17l-5-5" />
            </svg>
          )}
        </span>
      </button>
    );
  }

  const Sidebar = (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <button
          onClick={newChat}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-deep"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
          New chat
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {/* Projects.
            These used to live only inside a collapsible panel above the
            composer, so the project you were working in disappeared the
            moment you opened a chat — there was nowhere to see what existed
            or switch between them. The sidebar is where a persistent thing
            belongs. */}
        {/* Guests don't get projects, but hiding the section entirely means
            they never learn the feature exists — so they see the heading and
            what it's for, with signing in as the way to use it. */}
        {features && !features.projects && (
          <div className="mb-3">
            <p className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              Projects
            </p>
            <Link
              href="/login"
              className="block rounded-lg px-2.5 py-2 text-[12.5px] text-ink-faint transition-colors hover:bg-canvas hover:text-ink"
            >
              Sign in to group chats that share the same background.
            </Link>
          </div>
        )}

        {features?.projects && (
          <div className="mb-3">
            <div className="flex items-center justify-between px-2 pb-1.5 pt-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                Projects
              </p>
              {/* the sidebar shows what you're working in; the library page is
                  where you manage them */}
              <Link href="/projects" className="text-[11px] font-semibold text-brand hover:text-brand-deep">
                All
              </Link>
            </div>
            {projects.length === 0 ? (
              <Link
                href="/projects"
                className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-ink-faint transition-colors hover:bg-canvas hover:text-ink"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0" aria-hidden>
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Create a project
              </Link>
            ) : (
            <ul className="space-y-0.5">
              {projects.map((pr) => {
                const active = pr.id === activeProjectId;
                const count = chats.filter((c) => c.projectId === pr.id).length;
                return (
                  <li key={pr.id}>
                    <button
                      onClick={() => setActiveProjectId(active ? null : pr.id)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${
                        active ? "bg-brand-tint" : "hover:bg-canvas"
                      }`}
                    >
                      <svg
                        width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2"
                        className={`shrink-0 ${active ? "text-brand-deep" : "text-ink-faint"}`}
                        aria-hidden
                      >
                        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                      </svg>
                      <span className={`min-w-0 flex-1 truncate text-[13.5px] font-medium ${active ? "text-brand-deep" : "text-ink"}`}>
                        {pr.name}
                      </span>
                      {count > 0 && (
                        <span className="shrink-0 text-[11px] text-ink-faint">{count}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            )}
          </div>
        )}

        {chats.length === 0 ? (
          <p className="px-2 pt-2 text-[13px] text-ink-faint">No chats yet — your conversations will appear here.</p>
        ) : (
          <>
            <p className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              {activeProjectId
                ? `In ${projects.find((p) => p.id === activeProjectId)?.name ?? "project"}`
                : "Recents"}
            </p>
            <ul className="space-y-0.5">
              {(activeProjectId ? chats.filter((c) => c.projectId === activeProjectId) : chats).map((c) => (
                <li key={c.id} className="group relative">
                  <button
                    onClick={() => openChat(c.id)}
                    className={`w-full rounded-lg px-2.5 py-2 pr-8 text-left transition-colors ${
                      c.id === activeChatId ? "bg-brand-tint" : "hover:bg-canvas"
                    }`}
                  >
                    <span className={`block truncate text-[13.5px] font-medium ${c.id === activeChatId ? "text-brand-deep" : "text-ink"}`}>
                      {c.title}
                    </span>
                    <span className="block truncate text-[11.5px] text-ink-faint">
                      {all.find((m) => m.id === c.modelId)?.name ?? c.modelId}
                    </span>
                  </button>
                  <button
                    onClick={() => deleteChat(c.id)}
                    aria-label={`Delete chat: ${c.title}`}
                    className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 rounded p-1.5 text-ink-faint hover:bg-line hover:text-ink group-hover:block"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <p className="border-t border-line p-3 text-[11.5px] leading-relaxed text-ink-faint">
        Chats are stored on this device. Create a free account to sync them.
      </p>
    </div>
  );

  return (
    <div
      className={
        fullscreen
          ? "fixed inset-0 z-50 flex overflow-hidden bg-surface"
          : "card-shadow relative flex h-[540px] overflow-hidden rounded-2xl border border-line bg-surface"
      }
    >
      {/* Desktop sidebar */}
      <aside className="hidden w-[250px] shrink-0 border-r border-line bg-canvas/50 md:block">{Sidebar}</aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className={`${fullscreen ? "fixed" : "absolute"} inset-0 z-40 flex md:hidden`}>
          <div className="w-[270px] border-r border-line bg-surface shadow-xl">{Sidebar}</div>
          <button aria-label="Close chat list" className="flex-1 bg-ink/30" onClick={() => setSidebarOpen(false)} />
        </div>
      )}

      {/* Main column */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        {/* Deliberately NOT sticky.
            This is the first row of a fixed-height column whose message area
            scrolls on its own (see `min-h-0` below), so it stays on screen
            without help. Pinning it needed a `top` offset to clear the site
            header, and that offset pushed it down by exactly that much —
            leaving a gap above it that didn't line up with the sidebar. */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line bg-surface px-3 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-1">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Open chat list"
              className="rounded-lg p-2 text-ink-mute hover:bg-canvas md:hidden"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <div className="relative min-w-0" ref={pickerRef}>
              <button
                onClick={() => setPickerOpen((v) => !v)}
                aria-expanded={pickerOpen}
                className="flex max-w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[15px] font-semibold text-ink transition-colors hover:bg-canvas"
              >
                <span className="truncate">{activeModel.brand} <span className="font-normal text-ink-mute">{activeModel.version}</span></span>
                {activeModel.minPlan !== "free" && <LockIcon className="shrink-0 text-ink-faint" />}
                <svg
                  width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                  className={`shrink-0 text-ink-faint transition-transform ${pickerOpen ? "rotate-180" : ""}`} aria-hidden
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>

              {pickerOpen && (
                <div className="z-50 max-h-[420px] overflow-y-auto rounded-xl border border-line bg-surface p-2 shadow-lg max-sm:fixed max-sm:inset-x-3 max-sm:top-16 sm:absolute sm:left-0 sm:top-full sm:mt-2 sm:w-[320px]">
                  {modelsByBrand().map(({ brand, versions }, gi) => (
                    <div key={brand} className={gi > 0 ? "mt-1 border-t border-line pt-1" : ""}>
                      <p className="px-3 pb-0.5 pt-2 text-[12px] font-semibold uppercase tracking-wide text-ink-mute">
                        {brand}
                      </p>
                      {versions.map((m) => (
                        <ModelRow key={m.id} m={m} />
                      ))}
                    </div>
                  ))}
                  <div className="mt-2 border-t border-line p-3">
                    <Link href="/pricing" className="text-[13px] font-semibold text-brand hover:text-brand-deep">
                      Unlock premium versions →
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <span
              className={`hidden rounded-full px-3 py-1 text-xs font-semibold sm:inline ${
                activeModel.minPlan === "free" ? "bg-mint-tint text-mint" : "bg-brand-tint text-brand-deep"
              }`}
            >
              {activeModel.minPlan === "free" ? "Free for everyone" : "Any paid plan"}
            </span>
            {/* The two states used to differ only by which way four corner
                brackets pointed — at 16px they read as the same icon, so
                there was no visible way out of full screen. The exit state
                now carries a word and a border, because someone who has
                filled the screen needs the way back to be obvious, not
                discoverable. */}
            <button
              onClick={() => setFullscreen((v) => !v)}
              aria-label={fullscreen ? "Exit full screen" : "Full screen"}
              title={fullscreen ? "Exit full screen (Esc)" : "Full screen"}
              className={
                fullscreen
                  ? "flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[12.5px] font-semibold text-ink transition-colors hover:border-brand hover:bg-canvas"
                  : "rounded-lg p-2 text-ink-mute transition-colors hover:bg-canvas hover:text-ink"
              }
            >
              {fullscreen ? (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                    <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" />
                  </svg>
                  Exit
                </>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                  <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          <div className="mx-auto flex min-h-full max-w-2xl flex-col">
            {messages.length === 0 ? (
              <div className="my-auto text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-tint text-xl">💬</div>
                <h3 className="mt-4 font-display text-xl font-semibold">Chat with {activeModel.brand} <span className="text-ink-mute">· {activeModel.version}</span></h3>
                <p className="mx-auto mt-2 max-w-sm text-sm text-ink-mute">
                  {activeModel.strength}. Free to use — no account needed. Switch models anytime from the menu above.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map((m, i) =>
                  m.role === "user" ? (
                    <div key={i} className="group flex flex-col items-end">
                      {editingIndex === i ? (
                        <div className="w-full max-w-[85%] rounded-2xl border border-brand bg-surface p-2">
                          <textarea
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                saveEdit(i);
                              }
                              if (e.key === "Escape") setEditingIndex(null);
                            }}
                            rows={3}
                            autoFocus
                            aria-label="Edit your message"
                            className="w-full resize-y bg-transparent px-2 py-1 text-[15px] leading-relaxed text-ink outline-none"
                          />
                          <div className="mt-1 flex justify-end gap-2">
                            <button
                              onClick={() => setEditingIndex(null)}
                              className="rounded-lg border border-line px-3 py-1 text-[12.5px] font-semibold text-ink-mute hover:text-ink"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => saveEdit(i)}
                              disabled={!editDraft.trim()}
                              className="rounded-lg bg-brand px-3 py-1 text-[12.5px] font-semibold text-white hover:bg-brand-deep disabled:opacity-50"
                            >
                              Send again
                            </button>
                          </div>
                          <p className="mt-1 text-right text-[11px] text-ink-faint">
                            Replies after this message are replaced.
                          </p>
                        </div>
                      ) : (
                        <>
                          <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-[15px] leading-relaxed text-white">
                            {m.content}
                          </div>
                          {!busy && (
                            <button
                              onClick={() => {
                                setEditingIndex(i);
                                setEditDraft(m.content);
                              }}
                              className="mt-1 text-[11.5px] font-semibold text-ink-faint opacity-0 transition-opacity hover:text-ink group-hover:opacity-100 focus:opacity-100"
                            >
                              Edit
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  ) : (
                    <div key={i}>
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                        {m.modelName ?? activeModel.name}
                      </p>
                      {m.content ? (
                        <Markdown content={m.content} streaming={busy && i === messages.length - 1} />
                      ) : busy && i === messages.length - 1 ? (
                        <span className="inline-flex gap-1">
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint [animation-delay:0ms]" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint [animation-delay:120ms]" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint [animation-delay:240ms]" />
                        </span>
                      ) : null}
                      {/* only once the reply has finished — parsing a
                          half-streamed fence would flicker a wrong file count */}
                      {m.content && !(busy && i === messages.length - 1) && (
                        <div className="mt-1.5 flex items-center gap-2">
                          <button
                            onClick={() => copyReply(i, m.content)}
                            className="text-[11.5px] font-semibold text-ink-faint hover:text-ink"
                          >
                            {copiedIndex === i ? "Copied ✓" : "Copy"}
                          </button>
                          {i === messages.length - 1 && (
                            <button
                              onClick={regenerate}
                              disabled={busy}
                              className="text-[11.5px] font-semibold text-ink-faint hover:text-ink disabled:opacity-50"
                            >
                              Regenerate
                            </button>
                          )}
                        </div>
                      )}
                      {m.content && !(busy && i === messages.length - 1) && (
                        <BuildZipBar markdown={m.content} />
                      )}
                    </div>
                  ),
                )}
              </div>
            )}

            {blocker && (
              <div className="mt-6 rounded-xl border border-warn-line bg-warn-tint p-4 text-sm">
                <p className="font-semibold text-ink">{blocker.message}</p>
                {["daily_limit_reached", "model_locked", "package_exhausted"].includes(blocker.code) && (
                  <Link href="/pricing" className="mt-3 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-deep">
                    View packages
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Composer */}
        <div className="border-t border-line px-4 py-4 sm:px-6">
          <div className="mx-auto max-w-2xl">
            {challenge && (
              <TurnstileGate
                siteKey={challenge.siteKey}
                onToken={(token) => {
                  const turn = pendingTurn.current;
                  setChallenge(null);
                  pendingTurn.current = null;
                  // resume the exact message that was refused
                  if (turn) void runTurn(turn.chatId, turn.history, token);
                }}
                onUnavailable={() => {
                  setChallenge(null);
                  pendingTurn.current = null;
                  setBlocker({
                    code: "network",
                    message:
                      "The bot check couldn't load — an ad blocker or network filter may be blocking it. Try again, or sign in to skip the check.",
                  });
                }}
              />
            )}

            {panel === "skills" && features?.skills && (
              <div className="mb-2">
                <SkillsPanel
                  skills={skills}
                  setSkills={setSkills}
                  activeIds={activeSkillIds}
                  setActiveIds={setActiveSkillIds}
                  maxSkills={features.maxSkills}
                  onClose={() => setPanel("none")}
                />
              </div>
            )}
            {panel === "projects" && features?.projects && (
              <div className="mb-2">
                <ProjectPicker
                  projects={projects}
                  setProjects={setProjects}
                  activeId={activeProjectId}
                  setActiveId={setActiveProjectId}
                  maxProjects={features.maxProjects}
                  onClose={() => setPanel("none")}
                />
              </div>
            )}

            <div className="rounded-2xl border border-line bg-surface p-2 focus-within:border-brand">
              {/* attachments sit above the text, inside the same box */}
              {attachments.length > 0 && (
                <div className="mb-1.5 flex flex-wrap gap-2 px-1">
                  {attachments.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 rounded-lg border border-line bg-canvas px-2 py-1">
                      {a.kind === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.content} alt="" className="h-7 w-7 rounded object-cover" />
                      ) : (
                        <span className="text-[13px]">{a.kind === "pdf" ? "📕" : a.kind === "zip" ? "🗂️" : "📄"}</span>
                      )}
                      <span className="max-w-[170px] truncate text-[12px] text-ink">
                        {a.name}
                        {a.note && <span className="ml-1 text-ink-faint">· {a.note}</span>}
                      </span>
                      <button
                        onClick={() => setAttachments(attachments.filter((x) => x.id !== a.id))}
                        aria-label={`Remove ${a.name}`}
                        className="text-[12px] text-ink-faint hover:text-warn"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                placeholder={`Message ${activeModel.brand} (${activeModel.version})…`}
                disabled={busy}
                className="max-h-40 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none placeholder:text-ink-faint disabled:opacity-60"
              />
              {busy ? (
                <button
                  onClick={stop}
                  aria-label="Stop generating"
                  title="Stop generating"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-ink transition-colors hover:border-warn hover:text-warn"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <rect x="5" y="5" width="14" height="14" rx="2.5" />
                  </svg>
                </button>
              ) : (
                <button
                  onClick={send}
                  disabled={!input.trim()}
                  aria-label="Send message"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-white transition-colors hover:bg-brand-deep disabled:opacity-40"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
                    <path d="M12 19V5M5 12l7-7 7 7" />
                  </svg>
                </button>
              )}
              </div>

              {/* controls live inside the box, under the text */}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 px-1">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setPlusOpen((v) => !v)}
                    aria-label="Add files, skills or a project"
                    aria-expanded={plusOpen}
                    className={`flex h-7 w-7 items-center justify-center rounded-lg border text-[15px] leading-none transition-colors ${
                      plusOpen ? "border-brand bg-brand-tint text-brand-deep" : "border-line text-ink-mute hover:border-brand hover:text-ink"
                    }`}
                  >
                    +
                  </button>

                  {plusOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setPlusOpen(false)} />
                      <div className="absolute bottom-9 left-0 z-20 w-60 rounded-xl border border-line bg-surface p-1.5 shadow-lg">
                        <button
                          onClick={() => {
                            setPlusOpen(false);
                            if (features?.attachments) picker.open();
                          }}
                          disabled={!features?.attachments || picker.busy}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink hover:bg-canvas disabled:opacity-50"
                        >
                          <span>📎</span>
                          <span className="flex-1">
                            {picker.busy ? "Reading…" : "Attach files"}
                            <span className="block text-[11px] text-ink-faint">
                              {features?.attachments
                                ? `Images, text${features.pdfAttachments ? ", PDF" : ""}${features.zipAttachments ? ", .zip" : ""} · up to ${features.maxAttachmentMb}MB`
                                : "Sign in to attach files"}
                            </span>
                          </span>
                        </button>

                        <button
                          onClick={() => {
                            setPlusOpen(false);
                            if (features?.skills) setPanel(panel === "skills" ? "none" : "skills");
                          }}
                          disabled={!features?.skills}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink hover:bg-canvas disabled:opacity-50"
                        >
                          <span>✨</span>
                          <span className="flex-1">
                            Skills{activeSkillIds.length > 0 && ` (${activeSkillIds.length})`}
                            <span className="block text-[11px] text-ink-faint">
                              {features?.skills ? "Reusable instructions" : "Sign in to use skills"}
                            </span>
                          </span>
                        </button>

                        <button
                          onClick={() => {
                            setPlusOpen(false);
                            if (features?.projects) setPanel(panel === "projects" ? "none" : "projects");
                          }}
                          disabled={!features?.projects}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink hover:bg-canvas disabled:opacity-50"
                        >
                          <span>📁</span>
                          <span className="flex-1">
                            {projects.find((p) => p.id === activeProjectId)?.name ?? "Add to project"}
                            <span className="block text-[11px] text-ink-faint">
                              {features?.projects ? "Shared context for a set of chats" : "Sign in to use projects"}
                            </span>
                          </span>
                        </button>
                      </div>
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (!features?.webSearch) return;
                    setWebSearch((v) => !v);
                    setResearch(false);
                  }}
                  disabled={!features?.webSearch}
                  aria-pressed={webSearch && !research}
                  title={features ? `Live web results · ${features.webSearchDaily} a day` : "Loading…"}
                  className={`rounded-lg border px-2.5 py-1 text-[12px] font-semibold transition-colors ${
                    webSearch && !research
                      ? "border-brand bg-brand-tint text-brand-deep"
                      : "border-line text-ink-mute hover:border-brand hover:text-ink"
                  } ${!features?.webSearch ? "opacity-60" : ""}`}
                >
                  🌐 Web search
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!features?.research) return;
                    setResearch((v) => !v);
                    setWebSearch(false);
                  }}
                  disabled={!features?.research}
                  aria-pressed={research}
                  title={features?.research ? `Several searches, then a sourced answer · ${features.researchDaily} a day` : "Sign in to use research"}
                  className={`rounded-lg border px-2.5 py-1 text-[12px] font-semibold transition-colors ${
                    research
                      ? "border-brand bg-brand-tint text-brand-deep"
                      : "border-line text-ink-mute hover:border-brand hover:text-ink"
                  } ${!features?.research ? "opacity-60" : ""}`}
                >
                  🔬 Research
                </button>

                {features && !features.signedIn && (
                  <Link
                    href="/login"
                    className="ml-auto text-[11.5px] font-semibold text-brand hover:text-brand-deep"
                  >
                    Sign in to unlock →
                  </Link>
                )}
              </div>

              <input
                ref={picker.inputRef}
                type="file"
                multiple
                aria-hidden="true"
                tabIndex={-1}
                className="hidden"
                onChange={(e) => picker.accept(e.target.files)}
              />
            </div>

            {(picker.status || picker.error || attachments.length > 0) && (
              <div className="mt-1.5 px-1">
                {picker.status && <p className="text-[12px] text-ink-mute">{picker.status}</p>}
                {picker.error && <p className="text-[12px] font-semibold text-warn">{picker.error}</p>}
                {attachments.length > 0 && !picker.error && (
                  <p className="text-[11.5px] text-ink-faint">
                    Sent with every message in this chat until you remove them — larger files use more
                    of your credits each turn.
                  </p>
                )}
              </div>
            )}

            <p className="mt-2 text-center text-[12px] text-ink-faint">
              {research
                ? `Research runs several searches, then answers with sources · ${features?.researchDaily} a day`
                : webSearch
                  ? `Live web results will be used · ${features?.webSearchDaily} searches a day`
                  : /*
                     * Credits, not tokens. The allowance is spent at the
                     * model's own rate — the cheapest base model costs 4
                     * credits a token, so the old line promised roughly four
                     * times what it delivered. Both figures come from the API
                     * so changing them in /admin/limits updates this text too.
                     */
                    (features?.unlimitedModels?.length
                      ? `${features.unlimitedModels.join(" and ")} are unlimited · ` +
                        `${(features?.dailyCredits ?? 0).toLocaleString()} credits/day on the rest · `
                      : `Free: ${(features?.dailyCredits ?? 0).toLocaleString()} credits/day · `) +
                    `Enter to send, Shift+Enter for a new line`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
