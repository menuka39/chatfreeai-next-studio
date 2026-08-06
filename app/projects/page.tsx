import type { Metadata } from "next";
import ProjectsLibrary from "@/components/ProjectsLibrary";

export const metadata: Metadata = {
  alternates: { canonical: "/projects" },
  title: "Projects",
  description:
    "Group chats that share the same background. A project's brief is sent with every conversation inside it.",
};

export default function ProjectsPage() {
  return <ProjectsLibrary />;
}
