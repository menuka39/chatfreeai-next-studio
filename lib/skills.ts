/**
 * Skills — reusable instruction presets applied to a chat.
 *
 * A skill is a saved system instruction the user can switch on, so they don't
 * retype "answer as an accountant, show your working, be concise"
 * every session. Stored in the browser: they're personal preferences, not
 * something we need on a server, and keeping them local means we don't hold
 * people's prompt libraries.
 */

export interface Skill {
  id: string;
  name: string;
  emoji: string;
  instruction: string;
  builtIn?: boolean;
}

const uid = () => Math.random().toString(36).slice(2, 10);
const STORAGE_KEY = "cfai_skills";

/**
 * Starters. These are deliberately about HOW to answer rather than pretending
 * to be a licensed professional — a preset that says "you are a doctor" would
 * encourage people to treat the output as clinical advice.
 */
export const BUILT_IN_SKILLS: Skill[] = [
  {
    id: "builtin-concise",
    name: "Straight answers",
    emoji: "⚡",
    instruction:
      "Answer directly and briefly. Lead with the answer, then at most a few lines of reasoning. No preamble, no restating the question, no filler.",
    builtIn: true,
  },
  {
    id: "builtin-explain",
    name: "Explain simply",
    emoji: "🎓",
    instruction:
      "Explain as if to a smart beginner. Define jargon the first time it appears, use a concrete example for each idea, and finish with a one-line summary.",
    builtIn: true,
  },
  {
    id: "builtin-code",
    name: "Code review",
    emoji: "🔍",
    instruction:
      "Review code for correctness first, then security, then readability. Point to the exact line, say what breaks and why, and show the corrected version. Say so plainly when the code is fine.",
    builtIn: true,
  },
  {
    id: "builtin-email",
    name: "Professional writing",
    emoji: "✉️",
    instruction:
      "Write in clear professional English. Short sentences, no corporate filler, no exclamation marks. State the ask in the first line.",
    builtIn: true,
  },
  {
    id: "builtin-files",
    name: "Build me files",
    emoji: "🗂️",
    instruction:
      "When you write code that belongs in files, put EVERY file in its own code block and label it " +
      "with its full path on the opening fence, like ```php my-plugin/includes/admin.php. Use one " +
      "block per file, never combine files, and give complete file contents rather than fragments or " +
      "\"...rest unchanged\". Keep paths consistent so they form one project folder.",
    builtIn: true,
  },
  {
    id: "builtin-brainstorm",
    name: "Brainstorm",
    emoji: "💡",
    instruction:
      "Give several genuinely different options rather than variations of one idea. For each, note the main trade-off. Say which you'd pick and why.",
    builtIn: true,
  },
];

export function loadSkills(): Skill[] {
  if (typeof window === "undefined") return BUILT_IN_SKILLS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const custom = raw ? (JSON.parse(raw) as Skill[]) : [];
    return [...BUILT_IN_SKILLS, ...custom];
  } catch {
    return BUILT_IN_SKILLS;
  }
}

export function saveCustomSkills(skills: Skill[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(skills.filter((s) => !s.builtIn)));
  } catch {
    /* storage full — skills are a convenience */
  }
}

export const newSkill = (): Skill => ({ id: uid(), name: "", emoji: "✨", instruction: "" });

/** Combine the active skills into one system instruction. */
export function skillsToSystem(skills: Skill[]): string | null {
  const active = skills.filter((s) => s.instruction.trim());
  if (!active.length) return null;
  return active.map((s) => s.instruction.trim()).join("\n\n");
}
