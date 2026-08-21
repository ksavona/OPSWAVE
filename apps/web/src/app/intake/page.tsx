import Link from "next/link";

import { IntakePanel } from "../../components/intake-panel";
import { LogoutButton } from "../../components/logout-button";
import { getCurrentSession } from "../../server/current-session";

export default async function IntakePage() {
  const session = await getCurrentSession();
  return (
    <main className="app-page">
      <header className="app-header">
        <div>
          <p className="eyebrow">Personal operations workspace</p>
          <p className="owner-label">Signed in as {session.username}</p>
        </div>
        <nav aria-label="Primary navigation">
          <Link href="/">Workspace</Link>
          <Link href="/settings">Settings</Link>
          <LogoutButton />
        </nav>
      </header>
      <IntakePanel />
    </main>
  );
}
