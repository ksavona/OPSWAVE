import Link from "next/link";

import { LogoutButton } from "../../components/logout-button";
import { SettingsWorkspace } from "../../components/settings-workspace";
import { getCurrentSession } from "../../server/current-session";
import { getStore } from "../../server/runtime";
import { SettingsService } from "../../server/settings-service";

export default async function SettingsPage() {
  const session = await getCurrentSession();
  const store = getStore();
  const [data, stages] = await Promise.all([
    new SettingsService(store).read(session),
    store.listProjectStages(session.workspaceId),
  ]);
  const serializable = JSON.parse(JSON.stringify(data)) as Parameters<
    typeof SettingsWorkspace
  >[0]["initial"];
  return (
    <main className="app-page">
      <header className="app-header">
        <div>
          <p className="eyebrow">Owner controls</p>
          <h1>Settings</h1>
        </div>
        <nav aria-label="Primary navigation">
          <Link href="/">Workspace</Link>
          <LogoutButton />
        </nav>
      </header>
      <SettingsWorkspace
        initial={serializable}
        stages={
          JSON.parse(JSON.stringify(stages)) as NonNullable<
            Parameters<typeof SettingsWorkspace>[0]["stages"]
          >
        }
      />
    </main>
  );
}
