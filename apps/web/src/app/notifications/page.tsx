import Link from "next/link";

import { LogoutButton } from "../../components/logout-button";
import { NotificationCenter } from "../../components/notification-center";
import { getCurrentPrincipal } from "../../server/current-session";
import { getCollaborationStore } from "../../server/runtime";

export default async function NotificationsPage() {
  const principal = await getCurrentPrincipal();
  const notifications = await getCollaborationStore().listNotifications(principal.userId);
  return (
    <main className="app-page">
      <header className="app-header">
        <div>
          <p className="eyebrow">Private inbox</p>
          <h1>Notifications</h1>
        </div>
        <nav aria-label="Primary navigation">
          <Link href={principal.role === "delegate" ? "/delegated" : "/"}>Workspace</Link>
          {principal.role !== "delegate" ? <Link href="/delegations">Delegations</Link> : null}
          {principal.role !== "delegate" ? <Link href="/compliance">Compliance</Link> : null}
          <LogoutButton />
        </nav>
      </header>
      <NotificationCenter
        delegate={principal.role === "delegate"}
        initial={JSON.parse(JSON.stringify(notifications)) as never}
      />
    </main>
  );
}
