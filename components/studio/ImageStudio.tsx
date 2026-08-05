"use client";

/**
 * AI Image Studio — the cfai-studio interface, running on this app's API.
 *
 * Every class name, every panel, every button and every string is the one the
 * WordPress studio rendered; only the plumbing underneath changed. The rail,
 * the collapsible model bar, the aspect/count popovers, the mask editor, the
 * clip strip and the project grid all behave exactly as they did.
 *
 * What was dropped: the plugin's own wallet, PayPal buttons and WP gallery
 * tables. This app already has one credit pool and one checkout, so Credits
 * shows the monthly package and Payment points at /pricing.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { imageModels, imagePrice, dimensionsFor, type ImageModelConfig } from "@/lib/image-models";
import { imagePresets, imageIdeas } from "@/lib/image-presets";
import { packages } from "@/lib/packages";
import { allClips, type StudioClip } from "@/lib/studio-projects";
import { useStudioProjects, useStudioCredits, fmtCredits, greeting } from "./useStudio";
import "./image-studio.css";

type View = "generate" | "project" | "browser" | "guess" | "credits" | "payment";
type EditTool = "redraw" | "erase" | "expand" | "enhance";

const SHAPE: Record<string, string> = {
  "1:1": "s-11",
  "16:9": "s-169",
  "9:16": "s-916",
  "4:3": "s-43",
  "3:4": "s-34",
  "3:2": "s-32",
  "2:3": "s-23",
  "21:9": "s-219",
};

const SUGGEST = [
  "cinematic portrait, soft rim light",
  "isometric 3D game asset",
  "minimal product shot, studio",
  "watercolor dreamscape",
  "retro 80s synthwave city",
  "photoreal food, top-down",
];

const PROG_MSGS = ["Conjuring pixels…", "Diffusing noise…", "Rendering details…", "Almost there…"];

const EDIT_TOOLS: { tool: EditTool; label: string; ic: string; ph: string }[] = [
  { tool: "redraw", label: "Redraw", ic: "🖌", ph: "Describe what to redraw or change…" },
  { tool: "erase", label: "Erase", ic: "◆", ph: "Describe what to erase from the image…" },
  { tool: "expand", label: "Expand", ic: "⤢", ph: "Optional: what should appear in the extended areas…" },
  { tool: "enhance", label: "Enhance Image", ic: "✦", ph: "Optional: extra enhancement instructions…" },
];

const PROVIDER_COLOR: Record<string, string> = {
  OpenAI: "#10a37f",
  Google: "#4285f4",
  ByteDance: "#ff3b5c",
  "Black Forest Labs": "#7c5cff",
};

function modelMeta(m: ImageModelConfig) {
  const tags: string[] = [];
  if (m.tier === "premium") tags.push("Premium");
  else if (m.tier === "fast") tags.push("Fast");
  else tags.push("Standard");
  if (m.edit) tags.push("Edit");
  else if (m.transparent) tags.push("Cut-out");
  else if (m.qualityTiers) tags.push("4K");
  return { color: PROVIDER_COLOR[m.provider] ?? "#7c5cff", tags, hot: m.tier === "premium" };
}

/** A stable gradient per prompt, so idea cards have a face without stock art. */
function ideaGradient(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return `linear-gradient(135deg, hsl(${h} 62% 34%), hsl(${(h + 48) % 360} 58% 22%))`;
}

/**
 * Cards for "Get inspired" and "Guess".
 *
 * The plugin filled these from a WordPress gallery table of hand-picked
 * renders. There is no such table here, so the cards come from the prompt
 * library this app already ships: full example prompts first, then each style
 * preset phrased as a startable prompt.
 */
const IDEAS: { title: string; prompt: string }[] = [
  ...imageIdeas.map((p) => ({ title: p.split(",")[0].slice(0, 28), prompt: p })),
  ...imagePresets.flatMap((g) =>
    g.options.slice(0, 4).map((o) => ({ title: `${g.label} · ${o.label}`, prompt: o.append })),
  ),
];

/** The plugin's exact edit prompts — the mask semantics depend on this wording. */
function editPromptFor(tool: EditTool, p: string, maskUsed: boolean, aspect: string) {
  if (tool === "redraw") {
    if (maskUsed)
      return `This image has some areas painted over with translucent red highlight. Redraw / replace ONLY the red-highlighted areas as follows: ${p}. Remove the red highlight completely and keep every non-highlighted part of the image exactly the same.`;
    return `Edit this image. Redraw / repaint the following: ${p}. Keep every other part of the image exactly the same.`;
  }
  if (tool === "erase") {
    if (maskUsed)
      return `This image has some areas painted over with translucent red highlight. Completely remove whatever is underneath the red-highlighted areas and fill those areas naturally so they blend with the surroundings${p ? ` (${p})` : ""}. Remove the red highlight completely and keep every non-highlighted part of the image exactly the same.`;
    return `Edit this image. Completely remove the following: ${p}. Fill the removed area naturally so it blends with the surroundings. Keep everything else exactly the same.`;
  }
  if (tool === "expand")
    return `Outpaint this image: extend it beyond its current borders to a ${aspect} aspect ratio, continuing the scene naturally and seamlessly.${p ? ` In the extended areas: ${p}` : ""}`;
  return `Enhance this image: increase sharpness, detail and clarity, improve lighting and colors, and upscale the quality. Do not change the content, subject or composition.${p ? ` ${p}` : ""}`;
}

const fileToDataUrl = (f: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(f);
  });

export default function ImageStudio() {
  /* ---------------- state ---------------- */
  const [view, setView] = useState<View>("generate");
  const [modelId, setModelId] = useState(imageModels[0].id);
  const [aspect, setAspect] = useState(imageModels[0].aspectRatios[0]);
  const [sizeTier, setSizeTier] = useState<string | null>(null);
  const [count, setCount] = useState(1);
  const [prompt, setPrompt] = useState("");
  const [frames, setFrames] = useState<(string | null)[]>([null, null, null]);

  const [modelsOpen, setModelsOpen] = useState(false);
  const [showAllModels, setShowAllModels] = useState(false);
  const [editToolsOpen, setEditToolsOpen] = useState(false);
  const [pop, setPop] = useState<"aspect" | "count" | null>(null);

  const [busy, setBusy] = useState(false);
  const [progTxt, setProgTxt] = useState("Generating…");
  const [status, setStatus] = useState<{ msg: string; type?: "error" | "success" } | null>(null);
  const [shown, setShown] = useState<{ url: string; model: string; aspect: string; size: string } | null>(null);
  const [lastPrompt, setLastPrompt] = useState("");
  const [addMode, setAddMode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [zipping, setZipping] = useState<string | null>(null);

  /* mask editor */
  const [editorOpen, setEditorOpen] = useState(false);
  const [srcMenu, setSrcMenu] = useState<{ tool: EditTool; label: string; ph: string } | null>(null);
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [edTool, setEdTool] = useState<{ tool: EditTool; label: string; ph: string } | null>(null);
  const [edPrompt, setEdPrompt] = useState("");
  const [brush, setBrush] = useState(34);
  const [histIdx, setHistIdx] = useState(-1);
  const [histLen, setHistLen] = useState(0);
  const [pendingEdit, setPendingEdit] = useState<{ tool: EditTool; label: string; image: string; maskUsed: boolean } | null>(null);

  const baseRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<HTMLCanvasElement>(null);
  const histRef = useRef<ImageData[]>([]);
  const drawingRef = useRef(false);
  const editFileRef = useRef<HTMLInputElement>(null);
  const framesFileRef = useRef<HTMLInputElement>(null);
  const frameSlotRef = useRef(0);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const progTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const deviceRef = useRef<string | null>(null);

  const { projects, currentId, setCurrentId, push, remove } = useStudioProjects("image");
  const { credits, refresh: refreshCredits } = useStudioCredits();

  const model = useMemo(() => imageModels.find((m) => m.id === modelId)!, [modelId]);
  const ratios = model.aspectRatios;
  const price = imagePrice(model, sizeTier ?? undefined);
  const dims = dimensionsFor(ratios.includes(aspect) ? aspect : ratios[0], price.megapixels);
  const resTiers = model.qualityTiers?.map((q) => q.label) ?? ["Standard"];
  const maxCount = Math.min(5, model.maxImages ?? 1);
  const current = projects.find((p) => p.id === currentId) ?? null;
  const browserClips = useMemo(() => allClips(projects), [projects]);

  useEffect(() => {
    let id = localStorage.getItem("cfai_device");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("cfai_device", id);
    }
    deviceRef.current = id;
  }, []);

  /**
   * Picking a model resets every control it can't honour — the plugin's
   * setupModel(). Done here rather than in an effect so the whole switch lands
   * in one render instead of a second cascading one.
   */
  const pickModel = useCallback((m: ImageModelConfig) => {
    setModelId(m.id);
    setAspect((a) => (m.aspectRatios.includes(a) ? a : m.aspectRatios[0]));
    setSizeTier(null);
    setCount((c) => Math.min(c, Math.min(5, m.maxImages ?? 1)));
    setFrames((f) => (m.edit ? f.map((x, i) => (i < (m.maxReferences ?? 0) ? x : null)) : [null, null, null]));
  }, []);

  useEffect(() => {
    const close = () => {
      setPop(null);
      setEditToolsOpen(false);
    };
    document.addEventListener("click", close);
    return () => {
      document.removeEventListener("click", close);
      if (progTimer.current) clearInterval(progTimer.current);
    };
  }, []);

  const goto = (v: View) => setView((cur) => (cur === v ? "generate" : v));

  /* ---------------- viewer sizing (plugin's applyViewerAspect) ---------------- */
  const viewerStyle = useMemo(() => {
    const [w, h] = (shown?.aspect ?? aspect).split(":").map((n) => parseFloat(n) || 1);
    const maxH = typeof window === "undefined" ? 700 : Math.round(window.innerHeight * 0.8);
    return {
      aspectRatio: `${w} / ${h}`,
      maxWidth: `${Math.min(880, Math.max(260, Math.round(maxH * (w / h))))}px`,
    };
  }, [shown, aspect]);

  /* ---------------- frames ---------------- */
  async function onFrameFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const url = await fileToDataUrl(f);
    setFrames((prev) => prev.map((x, i) => (i === frameSlotRef.current ? url : x)));
  }

  /* ---------------- prompt helpers ---------------- */
  async function enhancePrompt() {
    if (!prompt.trim()) {
      setPrompt("a serene mountain lake at sunrise");
      return;
    }
    try {
      const res = await fetch("/api/image/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          isEditing: frames.some(Boolean),
          deviceId: deviceRef.current,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setStatus({ msg: json.message ?? "Could not rewrite that.", type: "error" });
        return;
      }
      setPrompt(json.prompt);
      setStatus(null);
    } catch {
      setStatus({ msg: "Connection lost. Try again.", type: "error" });
    }
    promptRef.current?.focus();
  }

  function applyPrompt(p: string) {
    setPrompt(p);
    setView("generate");
    setTimeout(() => promptRef.current?.focus(), 300);
  }

  /* ---------------- mask editor ---------------- */
  const currentImageDataUrl = useCallback((): string | null => {
    if (!shown?.url) return null;
    return shown.url;
  }, [shown]);

  function openSrcMenu(t: (typeof EDIT_TOOLS)[number]) {
    setSrcMenu({ tool: t.tool, label: t.label, ph: t.ph });
    setEditToolsOpen(false);
  }

  async function loadEditor(src: string, meta: { tool: EditTool; label: string; ph: string }) {
    setSrcMenu(null);
    setAssetsOpen(false);
    setEdTool(meta);
    setEdPrompt("");
    setEditorOpen(true);

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const base = baseRef.current;
      const mask = maskRef.current;
      if (!base || !mask) return;
      const max = 1024;
      let w = img.naturalWidth || 1024;
      let h = img.naturalHeight || 1024;
      if (w > max || h > max) {
        const r = Math.min(max / w, max / h);
        w = Math.round(w * r);
        h = Math.round(h * r);
      }
      base.width = w;
      base.height = h;
      mask.width = w;
      mask.height = h;
      base.getContext("2d")!.drawImage(img, 0, 0, w, h);
      const mctx = mask.getContext("2d")!;
      mctx.clearRect(0, 0, w, h);
      histRef.current = [mctx.getImageData(0, 0, w, h)];
      setHistIdx(0);
      setHistLen(1);
    };
    img.src = src;
  }

  function pushHist() {
    const mask = maskRef.current;
    if (!mask) return;
    const mctx = mask.getContext("2d")!;
    const next = histRef.current.slice(0, histIdx + 1);
    next.push(mctx.getImageData(0, 0, mask.width, mask.height));
    if (next.length > 25) next.shift();
    histRef.current = next;
    setHistIdx(next.length - 1);
    setHistLen(next.length);
  }

  function restoreHist(idx: number) {
    const mask = maskRef.current;
    const frame = histRef.current[idx];
    if (!mask || !frame) return;
    mask.getContext("2d")!.putImageData(frame, 0, 0);
    setHistIdx(idx);
  }

  function paint(e: React.PointerEvent<HTMLCanvasElement>) {
    const mask = maskRef.current;
    if (!mask || !drawingRef.current) return;
    const rect = mask.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * mask.width;
    const y = ((e.clientY - rect.top) / rect.height) * mask.height;
    const ctx = mask.getContext("2d")!;
    ctx.fillStyle = "rgba(255,60,60,0.55)";
    ctx.beginPath();
    ctx.arc(x, y, (brush / 100) * mask.width * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function maskHasStrokes() {
    const mask = maskRef.current;
    if (!mask) return false;
    const d = mask.getContext("2d")!.getImageData(0, 0, mask.width, mask.height).data;
    for (let i = 3; i < d.length; i += 40) if (d[i] > 8) return true;
    return false;
  }

  function applyEditor() {
    const base = baseRef.current;
    const mask = maskRef.current;
    if (!base || !mask || !edTool) return;
    const used = maskHasStrokes();
    const out = document.createElement("canvas");
    out.width = base.width;
    out.height = base.height;
    const ctx = out.getContext("2d")!;
    ctx.drawImage(base, 0, 0);
    if (used) ctx.drawImage(mask, 0, 0);
    setPendingEdit({
      tool: edTool.tool,
      label: edTool.label,
      image: out.toDataURL("image/jpeg", 0.87),
      maskUsed: used,
    });
    setPrompt(edPrompt);
    setEditorOpen(false);
    void runGenerate(false, edPrompt, {
      tool: edTool.tool,
      label: edTool.label,
      image: out.toDataURL("image/jpeg", 0.87),
      maskUsed: used,
    });
  }

  /* ---------------- download ---------------- */
  function triggerDownload(url: string, fname: string) {
    const a = document.createElement("a");
    a.href = url;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function saveToDevice() {
    if (!shown) return;
    const fname = `image-${Date.now()}.png`;
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = im.naturalWidth || 1024;
        c.height = im.naturalHeight || 1024;
        c.getContext("2d")!.drawImage(im, 0, 0, c.width, c.height);
        c.toBlob((b) => {
          if (!b) return triggerDownload(shown.url, fname);
          const u = URL.createObjectURL(b);
          triggerDownload(u, fname);
          setTimeout(() => URL.revokeObjectURL(u), 3000);
        }, "image/png");
      } catch {
        triggerDownload(shown.url, fname);
      }
    };
    im.onerror = () => triggerDownload(shown.url, fname);
    im.src = shown.url;
  }

  /** Download every image of a project as one ZIP — built in the browser. */
  async function projectZip(projId: string) {
    const proj = projects.find((p) => p.id === projId);
    if (!proj) return;
    setZipping(projId);
    setStatus({ msg: "Packaging your images into a ZIP…" });
    try {
      const { zipSync } = await import("fflate");
      const files: Record<string, Uint8Array> = {};
      for (let i = 0; i < proj.clips.length; i++) {
        const r = await fetch(proj.clips[i].url);
        files[`image-${i + 1}.png`] = new Uint8Array(await r.arrayBuffer());
      }
      const blob = new Blob([zipSync(files, { level: 0 }) as unknown as BlobPart], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      triggerDownload(url, `${proj.title.replace(/[^\w\s-]/g, "").slice(0, 40) || "project"}.zip`);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setStatus(null);
    } catch {
      // A provider link that refuses cross-origin reads can't go in a ZIP —
      // save the images one by one rather than failing the whole action.
      try {
        const { downloadAllImages } = await import("@/lib/download-image");
        await downloadAllImages(
          proj.clips.map((c, i) => ({ src: c.url, filename: `image-${i + 1}.png` })),
          undefined,
          (i, n) => setStatus({ msg: `Saving image ${i} of ${n}…` }),
        );
        setStatus(null);
      } catch {
        setStatus({ msg: "Could not download those images — try saving them one by one.", type: "error" });
      }
    } finally {
      setZipping(null);
    }
  }

  /* ---------------- generate ---------------- */
  function showImage(url: string, specs: { model: string; aspect: string; size: string }) {
    setShown({ url, ...specs });
  }

  async function runGenerate(
    isExtend: boolean,
    promptOverride?: string | null,
    edit?: { tool: EditTool; label: string; image: string; maskUsed: boolean } | null,
  ) {
    const p = (promptOverride != null ? promptOverride : prompt).trim();
    const ed = edit ?? null;
    if (!ed && !p) {
      setStatus({ msg: "Please enter a prompt.", type: "error" });
      return;
    }

    // Editing needs a model that accepts reference images. Rather than hiding
    // the tools, switch to the cheapest capable model and say so.
    let useModel = model;
    if ((ed || frames.some(Boolean)) && !useModel.edit) {
      const capable = imageModels.filter((m) => m.edit).sort((a, b) => a.credits - b.credits)[0];
      if (!capable) {
        setStatus({ msg: "No model here can edit images.", type: "error" });
        return;
      }
      useModel = capable;
      pickModel(capable);
    }

    const total = count;
    const specs = {
      model: useModel.id,
      aspect: useModel.aspectRatios.includes(aspect) ? aspect : useModel.aspectRatios[0],
      size: sizeTier ?? resTiers[0],
    };

    setStatus(null);
    setBusy(true);
    setLastPrompt(p);
    setShown(null);

    let k = 0;
    let done = 0;
    const label = () => (total > 1 ? `Image ${done + 1} of ${total} — ${PROG_MSGS[k]}` : PROG_MSGS[k]);
    setProgTxt(label());
    if (progTimer.current) clearInterval(progTimer.current);
    progTimer.current = setInterval(() => {
      k = (k + 1) % PROG_MSGS.length;
      setProgTxt(label());
    }, 1100);

    let launched = 0;
    let failed = false;
    let pid: string | null = isExtend ? currentId : null;

    const finish = () => {
      if (progTimer.current) clearInterval(progTimer.current);
      setBusy(false);
      setPendingEdit(null);
      void refreshCredits();
    };

    const references = ed ? [ed.image] : frames.filter(Boolean).slice(0, useModel.maxReferences ?? 0);
    const effPrompt = ed ? editPromptFor(ed.tool, p, ed.maskUsed, specs.aspect) : p;

    const step = async (): Promise<void> => {
      if (failed || launched >= total) return;
      launched++;
      try {
        const res = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modelId: useModel.id,
            prompt: effPrompt,
            aspectRatio: specs.aspect,
            ...(useModel.qualityTiers ? { quality: specs.size } : {}),
            ...(references.length ? { references } : {}),
          }),
        });
        const data = await res.json();
        if (failed) return;
        if (!res.ok) {
          failed = true;
          finish();
          setStatus({
            msg:
              total > 1 && done > 0
                ? `Stopped after ${done} of ${total} images: ${data.message ?? "Generation failed."}`
                : (data.message ?? "Generation failed."),
            type: "error",
          });
          if (data.error === "plan_required" || data.error === "package_exhausted") setView("payment");
          return;
        }

        const url: string = data.images?.[0] ?? data.imageUrl;
        showImage(url, specs);
        const clip: StudioClip = {
          job_id: `${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
          url,
          model: specs.model,
          aspect: specs.aspect,
          size: specs.size,
          prompt: (ed ? `[${ed.label}] ` : "") + p,
          ts: Date.now(),
        };
        pid = push(clip, pid ?? (done > 0 ? currentId : null));
        done++;

        if (done >= total) {
          finish();
          if (total > 1)
            setStatus({ msg: `${total} images generated — see the project below to download all.`, type: "success" });
          return;
        }
        setProgTxt(label());
        await step();
      } catch {
        if (failed) return;
        failed = true;
        finish();
        setStatus({ msg: "Connection lost. Please try again.", type: "error" });
      }
    };

    void step();
    if (total > 1) void step();
  }

  function newProject() {
    setAddMode(false);
    setCurrentId(null);
    setPrompt("");
    setShown(null);
    setStatus(null);
    setView("generate");
    setTimeout(() => promptRef.current?.focus(), 50);
  }

  /* ---------------- render ---------------- */
  const activeMeta = modelMeta(model);
  const visibleModels = showAllModels ? imageModels : imageModels.slice(0, 6);

  return (
    <div className="aig-wrap">
      <div className="aig-studio aig-app" data-single="0">
        {/* ============ RAIL ============ */}
        <div className="aig-rail">
          {(
            [
              ["generate", "✦", "Image Gen"],
              ["project", "◻", "Project"],
              ["browser", "▦", "Browser"],
              ["guess", "✧", "Guess"],
              ["credits", "●", "Credits"],
              ["payment", "💳", "Payment"],
            ] as [View, string, string][]
          ).map(([v, ic, l]) => (
            <button
              key={v}
              type="button"
              className={`aig-rail-btn${view === v ? " active" : ""}`}
              data-view={v}
              onClick={() => goto(v)}
            >
              <span className="aig-rail-ic">{ic}</span>
              <span className="aig-rail-l">{l}</span>
            </button>
          ))}
        </div>

        <div className="aig-views">
          {/* ============ GENERATE ============ */}
          <div className="aig-view aig-view-generate" style={{ display: view === "generate" ? "" : "none" }}>
            <div className="aig-genwrap">
              {/* ---------- LEFT SIDEBAR ---------- */}
              <div className="aig-side aig-controls">
                <button
                  type="button"
                  className="aig-edit-bar"
                  aria-expanded={editToolsOpen}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditToolsOpen((o) => !o);
                  }}
                >
                  <span className="aig-edit-bar-ic">✎</span>
                  <span className="aig-edit-bar-t">Image Edit Tools</span>
                  <span className="aig-model-bar-chev">›</span>
                </button>
                <div
                  className="aig-edit-tools"
                  style={{ display: editToolsOpen ? "flex" : "none" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {EDIT_TOOLS.map((t) => (
                    <button key={t.tool} type="button" className="aig-etool" onClick={() => openSrcMenu(t)}>
                      <span className="aig-etool-ic">{t.ic}</span> {t.label}
                    </button>
                  ))}
                </div>
                <input
                  ref={editFileRef}
                  type="file"
                  className="aig-edit-input"
                  accept="image/png,image/jpeg,image/webp"
                  style={{ display: "none" }}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f || !srcMenu) return;
                    void loadEditor(await fileToDataUrl(f), srcMenu);
                  }}
                />
                <div className="aig-side-divider" />

                {/* model bar + list */}
                <button
                  type="button"
                  className="aig-model-bar"
                  aria-expanded={modelsOpen}
                  onClick={() => setModelsOpen((o) => !o)}
                >
                  <span className="aig-model-bar-ic" style={{ background: activeMeta.color }}>
                    {model.name.charAt(0)}
                  </span>
                  <span className="aig-model-bar-text">
                    <span className="aig-model-bar-name">{model.name}</span>
                    <span className="aig-model-bar-sub">{model.provider}</span>
                  </span>
                  <span className="aig-model-bar-chev">›</span>
                </button>

                <div className={`aig-models aig-models-collapsed${modelsOpen ? " aig-open" : ""}`}>
                  {visibleModels.map((m) => {
                    const meta = modelMeta(m);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        className={`aig-model${m.id === modelId ? " active" : ""}`}
                        data-model={m.id}
                        onClick={() => {
                          pickModel(m);
                          setModelsOpen(false);
                        }}
                      >
                        <span className="aig-mh">
                          <span className="aig-ic" style={{ background: meta.color }}>
                            {m.name.charAt(0)}
                          </span>
                          <span className="aig-mtext">
                            <span className="aig-nm">{m.name}</span>
                            <span className="aig-pv">{m.provider}</span>
                          </span>
                        </span>
                        <span className="aig-tags">
                          {meta.tags.map((t, i) => (
                            <span key={t} className={`aig-tag${meta.hot && i === 0 ? " hot" : ""}`}>
                              {t}
                            </span>
                          ))}
                        </span>
                      </button>
                    );
                  })}
                  {imageModels.length > 6 && (
                    <button type="button" className="aig-morebtn" onClick={() => setShowAllModels((s) => !s)}>
                      {showAllModels ? "− Show fewer models" : `+ Show all ${imageModels.length} models`}
                    </button>
                  )}
                </div>

                {/* frames */}
                <div className="aig-frames">
                  <div className="aig-frames-label">
                    Frames <span className="aig-frames-hint">optional reference images</span>
                  </div>
                  <div className="aig-frames-row">
                    {[0, 1, 2].map((i) => (
                      <button
                        key={i}
                        type="button"
                        className="aig-frame"
                        data-i={i}
                        style={frames[i] ? { backgroundImage: `url(${frames[i]})` } : undefined}
                        onClick={() => {
                          if (frames[i]) {
                            setFrames((prev) => prev.map((x, j) => (j === i ? null : x)));
                            return;
                          }
                          frameSlotRef.current = i;
                          framesFileRef.current?.click();
                        }}
                      >
                        {!frames[i] && i === 0 && <span className="aig-frame-plus">+</span>}
                      </button>
                    ))}
                  </div>
                  <input
                    ref={framesFileRef}
                    type="file"
                    className="aig-frames-input"
                    accept="image/png,image/jpeg,image/webp"
                    style={{ display: "none" }}
                    onChange={onFrameFile}
                  />
                </div>

                {/* prompt */}
                <div className="aig-prompt-wrap">
                  <textarea
                    ref={promptRef}
                    className="aig-prompt"
                    maxLength={1000}
                    rows={6}
                    placeholder="Describe the image you want to create"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                  />
                  <div className="aig-prompt-bar">
                    <button type="button" className="aig-enhance" onClick={enhancePrompt}>
                      ✦ Enhance
                    </button>
                    <span className="aig-charcount">
                      <span className="aig-cc">{prompt.length}</span>/1000
                    </span>
                  </div>
                </div>
                <div className="aig-suggest">
                  {SUGGEST.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="aig-chip"
                      onClick={() => {
                        setPrompt((v) => (v ? `${v}, ${s}` : s));
                        promptRef.current?.focus();
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>

                {/* control bar */}
                <div className="aig-ctrlwrap">
                  <div
                    className="aig-pop aig-pop-aspect"
                    style={{ display: pop === "aspect" ? "block" : "none" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="aig-pop-title">Aspect Ratio</div>
                    <div className="aig-aspect-grid">
                      {ratios.map((a) => (
                        <button
                          key={a}
                          type="button"
                          className={`aig-asp${a === aspect ? " active" : ""}`}
                          data-aspect={a}
                          onClick={() => setAspect(a)}
                        >
                          <span className={`aig-shape ${SHAPE[a] ?? "s-11"}`} />
                          <span className="aig-asp-l">{a}</span>
                        </button>
                      ))}
                    </div>
                    <div className="aig-pop-title">Resolution</div>
                    <div className="aig-res-row">
                      {resTiers.map((r) => (
                        <button
                          key={r}
                          type="button"
                          className={`aig-res${(sizeTier ?? resTiers[0]) === r ? " active" : ""}`}
                          data-size={r}
                          onClick={() => setSizeTier(r)}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div
                    className="aig-pop aig-pop-count"
                    style={{ display: pop === "count" ? "block" : "none" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="aig-pop-title">Generation count</div>
                    <div className="aig-count-list">
                      {Array.from({ length: maxCount }, (_, i) => i + 1).map((c) => (
                        <button
                          key={c}
                          type="button"
                          className={`aig-cnt${count === c ? " active" : ""}`}
                          data-count={c}
                          onClick={() => {
                            setCount(c);
                            setPop(null);
                          }}
                        >
                          ×{c}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="aig-ctrlbar">
                    <button
                      type="button"
                      className="aig-ctrl aig-ctrl-aspect"
                      aria-expanded={pop === "aspect"}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPop((x) => (x === "aspect" ? null : "aspect"));
                      }}
                    >
                      <span className={`aig-shape aig-ctrl-shape ${SHAPE[aspect] ?? "s-11"}`} />
                      <span className="aig-ctrl-aspect-label">
                        {aspect} · {sizeTier ?? resTiers[0]}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="aig-ctrl aig-ctrl-count"
                      aria-expanded={pop === "count"}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPop((x) => (x === "count" ? null : "count"));
                      }}
                    >
                      <span className="aig-ctrl-count-ic">⧉</span>
                      <span className="aig-count-label">×{count}</span>
                    </button>
                  </div>
                </div>

                {/* add-to-project banner */}
                <div className="aig-addmode" style={{ display: addMode ? "flex" : "none" }}>
                  <span className="aig-addmode-ico">＋</span>
                  <div className="aig-addmode-body">
                    <strong>Adding to this project</strong>
                    <span>Describe the next image, then press Generate. It joins the current project.</span>
                  </div>
                  <button
                    type="button"
                    className="aig-addmode-cancel"
                    aria-label="Cancel"
                    onClick={() => setAddMode(false)}
                  >
                    ×
                  </button>
                </div>

                <div className="aig-side-foot">
                  <button
                    type="button"
                    className={`aig-generate${busy ? " aig-loading" : ""}`}
                    disabled={busy}
                    onClick={() => {
                      const ext = addMode;
                      setAddMode(false);
                      void runGenerate(ext, null, pendingEdit);
                    }}
                  >
                    <span className="aig-gen-star">✦</span>{" "}
                    <span className="aig-gen-label">
                      {busy ? "Generating…" : addMode ? "Add to project" : "Generate Image"}
                    </span>{" "}
                    <span className="aig-cost">{fmtCredits(price.credits * count)} credits</span>
                  </button>
                  <div
                    className={`aig-credit-note${
                      credits && credits.signedIn && credits.remaining <= 0
                        ? " zero"
                        : credits && credits.cap > 0 && credits.remaining < credits.cap * 0.1
                          ? " low"
                          : ""
                    }`}
                  >
                    {credits?.signedIn && credits.cap > 0
                      ? `${fmtCredits(credits.remaining)} of ${fmtCredits(credits.cap)} monthly credits left · ${dims.width}×${dims.height} · ${model.genTime}`
                      : `${dims.width}×${dims.height} · ${model.name} · ready in ${model.genTime}`}
                  </div>
                  {credits && !credits.signedIn && (
                    <p className="aig-note">
                      <Link href="/login">Log in</Link> to generate and use your credits.
                    </p>
                  )}
                </div>
              </div>

              {/* ---------- MAIN ---------- */}
              <div className="aig-main">
                <div className="aig-hero">
                  <h2 className="aig-hero-h">
                    <span className="aig-hero-greet">{greeting()}</span>, let&apos;s make something
                  </h2>
                  <p className="aig-hero-tag">
                    Every top image model on one page — charged from your monthly credits.
                  </p>
                </div>

                <div className="aig-output-area" style={{ display: shown || busy ? "block" : "none" }}>
                  <div className="aig-viewer" style={viewerStyle}>
                    <div className="aig-tick aig-tick-tl" />
                    <div className="aig-tick aig-tick-tr" />
                    <div className="aig-tick aig-tick-bl" />
                    <div className="aig-tick aig-tick-br" />
                    {shown && !busy && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="aig-image aig-in" alt="" decoding="async" src={shown.url} />
                    )}
                    <div className="aig-prog" style={{ display: busy ? "block" : "none" }}>
                      <div className="aig-shine" />
                      <div className="aig-spinner" />
                      <p className="aig-prog-txt">{progTxt}</p>
                    </div>
                  </div>

                  <div className="aig-meta" style={{ display: shown && !busy ? "flex" : "none" }}>
                    <span>{imageModels.find((m) => m.id === shown?.model)?.name ?? shown?.model}</span>
                    <span>{shown?.aspect}</span>
                    {shown?.size && <span>{shown.size}</span>}
                  </div>

                  <div className="aig-actions" style={{ display: shown && !busy ? "flex" : "none" }}>
                    <button type="button" className="aig-download aig-primary" onClick={saveToDevice}>
                      ⬇ Download
                    </button>
                    <button
                      type="button"
                      className="aig-extend"
                      title="Add another image to this project"
                      onClick={() => {
                        setAddMode(true);
                        promptRef.current?.focus();
                      }}
                    >
                      ＋ Add image
                    </button>
                    <button type="button" className="aig-variations" onClick={() => void runGenerate(true, lastPrompt)}>
                      ⟲ Variations
                    </button>
                    <button
                      type="button"
                      className={`aig-copy${copied ? " aig-copied" : ""}`}
                      onClick={() => {
                        void navigator.clipboard?.writeText(lastPrompt || prompt);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1200);
                      }}
                    >
                      ⧉ Copy prompt
                    </button>
                    <button type="button" className="aig-newproj" onClick={newProject}>
                      ＋ New project
                    </button>
                  </div>
                  <p className="aig-actions-hint" style={{ display: shown && !busy ? "block" : "none" }}>
                    <strong>Add image</strong> puts another image in this project (type the next one, then
                    Generate). Open the Project tab to download all images of a project.
                  </p>

                  <div className="aig-clipstrip">
                    {current && current.clips.length > 1
                      ? current.clips.map((clip, idx) => (
                          <div
                            key={clip.job_id}
                            className="aig-gthumb"
                            style={{ backgroundImage: `url(${clip.url})` }}
                            onClick={() => {
                              showImage(clip.url, {
                                model: clip.model,
                                aspect: clip.aspect ?? "1:1",
                                size: clip.size ?? "",
                              });
                              setLastPrompt(clip.prompt);
                            }}
                          >
                            <span className="aig-gnum">{idx + 1}</span>
                          </div>
                        ))
                      : null}
                  </div>
                </div>

                {status && (
                  <div
                    className={`aig-status${status.type ? ` aig-${status.type}` : ""}`}
                    style={{ display: "block" }}
                  >
                    {status.msg}
                  </div>
                )}

                {!shown && !busy && (
                  <div className="aig-insp">
                    <div className="aig-insp-head">
                      <h3>Get inspired</h3>
                      <p>Tap a card to reuse its prompt</p>
                    </div>
                    <div className="aig-insp-grid">
                      {IDEAS.slice(0, 12).map((g) => (
                        <button
                          key={g.prompt}
                          type="button"
                          className="aig-insp-card"
                          onClick={() => applyPrompt(g.prompt)}
                        >
                          <span className="aig-insp-thumb" style={{ backgroundImage: ideaGradient(g.prompt) }} />
                          <span className="aig-insp-title">{g.title}</span>
                          <span className="aig-insp-desc">{g.prompt.split(/\s+/).slice(0, 10).join(" ")}…</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ============ PROJECT ============ */}
          <div className="aig-view aig-view-project" style={{ display: view === "project" ? "" : "none" }}>
            <h2 className="aig-view-h">Recent Projects</h2>
            <p className="aig-view-sub">
              {credits?.signedIn ? "Synced to your account." : "Saved in this browser."}
            </p>
            <div className="aig-projgrid">
              <button type="button" className="aig-projcard aig-projcard-new" onClick={newProject}>
                <span className="aig-frame-plus">+</span>
              </button>
              {projects.map((proj) => {
                const last = proj.clips[proj.clips.length - 1];
                return (
                  <div
                    key={proj.id}
                    className={`aig-projcard${proj.id === currentId ? " current" : ""}`}
                    onClick={() => {
                      setCurrentId(proj.id);
                      setView("generate");
                      if (last) {
                        showImage(last.url, {
                          model: last.model,
                          aspect: last.aspect ?? "1:1",
                          size: last.size ?? "",
                        });
                        setLastPrompt(last.prompt);
                      }
                    }}
                  >
                    <div
                      className="aig-projcard-cover"
                      style={last ? { backgroundImage: `url(${last.url})` } : undefined}
                    />
                    <div className="aig-projcard-body">
                      <span className="aig-projcard-title">{proj.title}</span>
                      <span className="aig-projcard-meta">
                        {proj.clips.length} {proj.clips.length === 1 ? "image" : "images"}
                      </span>
                    </div>
                    <div className="aig-projcard-acts">
                      <button
                        type="button"
                        className="aig-projcard-act"
                        title="Download all (zip)"
                        disabled={zipping === proj.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          void projectZip(proj.id);
                        }}
                      >
                        ⤓
                      </button>
                      <button
                        type="button"
                        className="aig-projcard-act aig-projcard-del"
                        title="Delete project"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!window.confirm("Delete this project? Your generated images stay in your account history."))
                            return;
                          remove(proj.id);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ============ BROWSER ============ */}
          <div className="aig-view aig-view-browser" style={{ display: view === "browser" ? "" : "none" }}>
            <h2 className="aig-view-h">Browser</h2>
            <p className="aig-view-sub">All your generated images.</p>
            <div className="aig-browsegrid">
              {browserClips.map((x) => (
                <button
                  key={x.clip.job_id}
                  type="button"
                  className="aig-asset"
                  style={{ backgroundImage: `url(${x.clip.url})` }}
                  title={x.clip.prompt}
                  onClick={() => {
                    setCurrentId(x.proj.id);
                    setView("generate");
                    showImage(x.clip.url, {
                      model: x.clip.model,
                      aspect: x.clip.aspect ?? "1:1",
                      size: x.clip.size ?? "",
                    });
                    setLastPrompt(x.clip.prompt);
                  }}
                />
              ))}
            </div>
            <p className="aig-browse-empty" style={{ display: browserClips.length ? "none" : "block" }}>
              No images yet — generate your first image to see it here.
            </p>
          </div>

          {/* ============ GUESS ============ */}
          <div className="aig-view aig-view-guess" style={{ display: view === "guess" ? "" : "none" }}>
            <h2 className="aig-view-h">Guess</h2>
            <p className="aig-view-sub">Tap a style to reuse its prompt.</p>
            <div className="aig-guessgrid">
              {IDEAS.slice(0, 16).map((g) => (
                <button
                  key={g.prompt}
                  type="button"
                  className="aig-guess-card"
                  onClick={() => applyPrompt(g.prompt)}
                >
                  <span className="aig-guess-thumb" style={{ backgroundImage: ideaGradient(g.prompt) }} />
                  <span className="aig-guess-title">{g.title}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ============ CREDITS ============ */}
          <div className="aig-view aig-view-credits" style={{ display: view === "credits" ? "" : "none" }}>
            <h2 className="aig-view-h">Your Credits</h2>
            <p className="aig-view-sub">
              One balance for images, video, audio and chat — and here is what this month looks like.
            </p>
            <div className="aig-buy">
              <div className="aig-panel">
                <span className="aig-eyebrow">Your credits</span>
                <h3 className="aig-h">Your balance</h3>
                <table className="aig-table">
                  <thead>
                    <tr>
                      <th>Package</th>
                      <th>Credits left</th>
                      <th>Cost per image</th>
                    </tr>
                  </thead>
                  <tbody>
                    {credits?.signedIn && credits.cap > 0 ? (
                      <tr>
                        <td>
                          <strong>{credits.packageName}</strong>
                        </td>
                        <td>
                          <strong>
                            {fmtCredits(credits.remaining)} / {fmtCredits(credits.cap)}
                          </strong>
                        </td>
                        <td>
                          {fmtCredits(price.credits)} credits <span>({model.name})</span>
                        </td>
                      </tr>
                    ) : (
                      <tr>
                        <td colSpan={3}>
                          No package yet. Image generation is included in every paid plan — pick one to start.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {browserClips.length > 0 && (
                  <>
                    <div className="aig-sublabel" style={{ marginTop: 18 }}>
                      Recent images
                    </div>
                    <div className="aig-gallery">
                      {browserClips.slice(0, 8).map((x) => (
                        <div
                          key={x.clip.job_id}
                          className="aig-gthumb"
                          style={{ backgroundImage: `url(${x.clip.url})` }}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ============ PAYMENT ============ */}
          <div className="aig-view aig-view-payment" style={{ display: view === "payment" ? "" : "none" }}>
            <h2 className="aig-view-h">Payment</h2>
            <p className="aig-view-sub">Monthly credits that work across every model — secure checkout.</p>
            <div className="aig-buy">
              <div className="aig-panel">
                <span className="aig-eyebrow">Packages</span>
                <h3 className="aig-h">Choose a package</h3>
                <table className="aig-table">
                  <thead>
                    <tr>
                      <th>Package</th>
                      <th>Monthly credits</th>
                      <th>Price</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {packages.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.name}</strong>
                        </td>
                        <td>{fmtCredits(p.credits)}</td>
                        <td>${p.price.toFixed(2)}</td>
                        <td>
                          <Link href="/pricing">Choose</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="aig-note">
                  Failed generations are never charged — the credits go straight back to your balance.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ============ MASK EDITOR ============ */}
        <div className="aig-editor" style={{ display: editorOpen ? "flex" : "none" }}>
          <div className="aig-editor-top">
            <button
              type="button"
              className="aig-editor-close"
              aria-label="Close editor"
              onClick={() => setEditorOpen(false)}
            >
              ×
            </button>
            <span className="aig-editor-title">{edTool?.label}</span>
          </div>
          <p className="aig-editor-modelnote">
            {model.edit
              ? `Editing with ${model.name}.`
              : `Editing switches to the cheapest model here that can edit images.`}
          </p>
          <div className="aig-editor-stage">
            <div className="aig-editor-canvas-wrap">
              <canvas ref={baseRef} className="aig-editor-canvas" />
              <canvas
                ref={maskRef}
                className="aig-editor-mask"
                onPointerDown={(e) => {
                  drawingRef.current = true;
                  (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
                  paint(e);
                }}
                onPointerMove={paint}
                onPointerUp={() => {
                  if (!drawingRef.current) return;
                  drawingRef.current = false;
                  pushHist();
                }}
              />
            </div>
          </div>
          <div className="aig-editor-toolsrow">
            <div className="aig-editor-toolgroup aig-editor-brushgrp">
              <span className="aig-editor-brush-ic">🖌</span>
              <input
                type="range"
                className="aig-editor-brushsize"
                min={8}
                max={90}
                value={brush}
                onChange={(e) => setBrush(Number(e.target.value))}
              />
            </div>
            <div className="aig-editor-toolgroup aig-editor-histgrp">
              <button
                type="button"
                className="aig-editor-undo"
                disabled={histIdx <= 0}
                aria-label="Undo"
                onClick={() => restoreHist(histIdx - 1)}
              >
                ↶
              </button>
              <button
                type="button"
                className="aig-editor-redo"
                disabled={histIdx >= histLen - 1}
                aria-label="Redo"
                onClick={() => restoreHist(histIdx + 1)}
              >
                ↷
              </button>
              <span className="aig-editor-sep" />
              <button type="button" className="aig-editor-clear" disabled={histIdx <= 0} onClick={() => restoreHist(0)}>
                Clear
              </button>
            </div>
          </div>
          <p className="aig-editor-hint">
            Paint over the areas you want to change — or leave it blank and just describe the edit.
          </p>
          <div className="aig-editor-bottom">
            <input
              type="text"
              className="aig-editor-prompt"
              maxLength={500}
              placeholder={edTool?.ph}
              value={edPrompt}
              onChange={(e) => setEdPrompt(e.target.value)}
            />
            <button type="button" className="aig-editor-apply" onClick={applyEditor}>
              <span className="aig-gen-star">✦</span> Apply
            </button>
          </div>
        </div>

        {/* ============ EDIT SOURCE MENU ============ */}
        <div className="aig-edit-src" style={{ display: srcMenu ? "flex" : "none" }}>
          <button
            type="button"
            className="aig-src-cur"
            style={{ display: shown ? "" : "none" }}
            onClick={() => {
              const src = currentImageDataUrl();
              if (src && srcMenu) void loadEditor(src, srcMenu);
            }}
          >
            <span className="aig-src-ic">▣</span> Use current image
          </button>
          <button type="button" className="aig-src-browse" onClick={() => setAssetsOpen(true)}>
            <span className="aig-src-ic">⧉</span> Browse Assets
          </button>
          <button type="button" className="aig-src-upload" onClick={() => editFileRef.current?.click()}>
            <span className="aig-src-ic">⇧</span> Upload from device
          </button>
        </div>

        {/* ============ ASSET PICKER ============ */}
        <div className="aig-assets" style={{ display: assetsOpen ? "flex" : "none" }}>
          <div className="aig-editor-top">
            <button type="button" className="aig-assets-close" aria-label="Close" onClick={() => setAssetsOpen(false)}>
              ×
            </button>
            <span className="aig-editor-title">Select an image</span>
          </div>
          <div className="aig-assets-scroll">
            <div className="aig-assets-grid">
              {browserClips.map((x) => (
                <button
                  key={x.clip.job_id}
                  type="button"
                  className="aig-asset"
                  style={{ backgroundImage: `url(${x.clip.url})` }}
                  onClick={() => srcMenu && void loadEditor(x.clip.url, srcMenu)}
                />
              ))}
            </div>
            <p className="aig-assets-empty" style={{ display: browserClips.length ? "none" : "block" }}>
              No generated images yet — upload from device instead.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
