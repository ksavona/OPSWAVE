import Link from "next/link";
import { redirect } from "next/navigation";

import { DelegateWorkspace } from "../../components/delegate-workspace";
import { LogoutButton } from "../../components/logout-button";
import { getCurrentPrincipal } from "../../server/current-session";
import { getCollaborationStore } from "../../server/runtime";

export default async function DelegatedPage() {
  const principal = await getCurrentPrincipal();
  if (principal.role !== "delegate") redirect("/");
  const workspace = await getCollaborationStore().listDelegateWorkspace(
    principal.workspaceId,
    principal.membershipId,
    principal.userId,
  );
  return (
    <main className="app-page delegated-page">
      <header className="app-header">
        <div>
          <p className="eyebrow">Limited collaboration workspace</p>
          <h1>Delegated work</h1>
          <p className="owner-label">Signed in as {principal.fullName ?? principal.email}</p>
        </div>
        <nav aria-label="Primary navigation">
          <Link href="/notifications">Notifications</Link>
          <LogoutButton />
        </nav>
      </header>
      <DelegateWorkspace initial={JSON.parse(JSON.stringify(workspace)) as never} />
    </main>
  );
}
