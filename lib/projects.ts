/**
 * Projects — group chats that share context.
 *
 * A project holds a short brief ("we're building a WordPress plugin for X, the
 * stack is Y") that is prepended to every chat inside it, so the user stops
 * re-explaining their situation in each new conversation. Stored in the
 * browser alongside the chats themselves.
 */

export interface Project {
  id: string;
  name: string;
  emoji: string;
  /** shared context prepended to every chat in this project */
  brief: string;
  createdAt: number;
  /**
   * Last time the brief was edited. Optional because projects created before
   * this field existed have no value — those fall back to createdAt rather
   * than being stamped with "now", which would reorder someone's whole list
   * on first load.
   */
  updatedAt?: number;
}

/** Most recently touched first — the default ordering everywhere. */
export const projectTouchedAt = (p: Project) => p.updatedAt ?? p.createdAt;

const uid = () => Math.random().toString(36).slice(2, 10);
const STORAGE_KEY = "cfai_projects";

export function loadProjects(): Project[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Project[]) : [];
  } catch {
    return [];
  }
}

export function saveProjects(projects: Project[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch {
    /* storage full */
  }
}

export const newProject = (): Project => ({
  id: uid(),
  name: "",
  emoji: "📁",
  brief: "",
  createdAt: Date.now(),
});

export function projectSystem(project: Project | null): string | null {
  if (!project?.brief.trim()) return null;
  return `Project context — the user is working on "${project.name}":\n${project.brief.trim()}`;
}
