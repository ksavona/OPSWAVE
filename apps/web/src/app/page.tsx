import Link from "next/link";

import { LogoutButton } from "../components/logout-button";
import { Workspace } from "../components/workspace";
import { getCurrentSession } from "../server/current-session";
import { getStore } from "../server/runtime";
import { WorkService } from "../server/work-service";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const session = await getCurrentSession();
  const workspace = await new WorkService(getStore()).readWorkspace(
    session,
    (await searchParams).sort,
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
          <Link href="/settings">Settings</Link>
          <LogoutButton />
        </nav>
      </header>
      <Workspace initial={initial} />
    </main>
  );
}
