import Link from "next/link";
import { redirect } from "next/navigation";

import { DelegationsWorkspace } from "../../components/delegations-workspace";
import { LogoutButton } from "../../components/logout-button";
import { getCurrentPrincipal, getCurrentSession } from "../../server/current-session";
import { getCollaborationStore, getStore } from "../../server/runtime";
import { WorkService } from "../../server/work-service";

export default async function DelegationsPage() {
  const principal = await getCurrentPrincipal();
  if (principal.role === "delegate") redirect("/delegated");
  const ownerSession = await getCurrentSession();
  const [workspace, grants, users] = await Promise.all([
    new WorkService(getStore()).readWorkspace(ownerSession),
    getCollaborationStore().listAccessGrants(principal.workspaceId),
    getCollaborationStore().listUsers(principal.workspaceId),
  ]);
  const subjects = [
    ...workspace.projects
      .filter((project) => project.archivedAt === null)
      .map((project) => ({ id: project.id, label: project.name, type: "project" as const })),
    ...workspace.tasks.map((task) => ({ id: task.id, label: task.title, type: "task" as const })),
  ];
  return (
    <main className="app-page">
      <header className="app-header">
        <div>
          <p className="eyebrow">Access and collaboration</p>
          <h1>Delegations</h1>
        </div>
        <nav aria-label="Primary navigation">
          <Link href="/">Workspace</Link>
          <Link href="/notifications">Notifications</Link>
          <Link href="/compliance">Compliance</Link>
          <Link href="/settings">Settings</Link>
          <LogoutButton />
        </nav>
      </header>
      <DelegationsWorkspace
        initialGrants={JSON.parse(JSON.stringify(grants)) as never}
        initialUsers={JSON.parse(JSON.stringify(users)) as never}
        subjects={subjects}
      />
    </main>
  );
}
