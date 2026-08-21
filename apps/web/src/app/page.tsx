import Link from "next/link";

import { LogoutButton } from "../components/logout-button";
import { Workspace } from "../components/workspace";
import { getCurrentSession } from "../server/current-session";
import { getCollaborationStore, getStore } from "../server/runtime";
import { WorkService } from "../server/work-service";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; sort?: string; task?: string }>;
}) {
  const session = await getCurrentSession();
  const parameters = await searchParams;
  const workspace = await new WorkService(getStore(), getCollaborationStore()).readWorkspace(
    session,
    parameters.sort,
  );
  const initial = JSON.parse(JSON.stringify(workspace)) as Parameters<
    typeof Workspace
  >[0]["initial"];
  return (
    <main className="app-page">
      <header className="app-header">
        <div>
          <p className="eyebrow">Personal operations workspace</p>
          <p className="owner-label">Signed in as {session.username}</p>
        </div>
        <nav aria-label="Primary navigation">
          <Link href="/delegations">Delegations</Link>
          <Link href="/notifications">Notifications</Link>
          <Link href="/compliance">Compliance</Link>
          <Link href="/settings">Settings</Link>
          <Link href="/intake">Intake</Link>
          <LogoutButton />
        </nav>
      </header>
      <Workspace
        initial={initial}
        initialOpenRecord={
          typeof parameters.task === "string"
            ? { id: parameters.task, type: "task" }
            : typeof parameters.project === "string"
              ? { id: parameters.project, type: "project" }
              : null
        }
      />
    </main>
  );
}
