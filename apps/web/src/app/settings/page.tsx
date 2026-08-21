import Link from "next/link";

import { LogoutButton } from "../../components/logout-button";
import { SettingsWorkspace } from "../../components/settings-workspace";
import { getCurrentPrincipal, getCurrentSession } from "../../server/current-session";
import { getCollaborationStore, getStore } from "../../server/runtime";
import { SettingsService } from "../../server/settings-service";
import { DelegationService } from "../../server/delegation-service";

export default async function SettingsPage() {
  const session = await getCurrentSession();
  const principal = await getCurrentPrincipal();
  const store = getStore();
  const collaborationStore = getCollaborationStore();
  const [data, stages, collaboration, collaborationRuntime] = await Promise.all([
    new SettingsService(store).read(session),
    store.listProjectStages(session.workspaceId),
    collaborationStore.getCollaborationFlags(session.workspaceId),
    new DelegationService(collaborationStore).runtimeConfiguration(principal),
  ]);
  const serializable = JSON.parse(JSON.stringify(data)) as Parameters<
    typeof SettingsWorkspace
  >[0]["initial"];
  const serializableCollaborationRuntime = JSON.parse(
    JSON.stringify(collaborationRuntime),
  ) as NonNullable<Parameters<typeof SettingsWorkspace>[0]["initialCollaborationRuntime"]>;
  return (
    <main className="app-page">
      <header className="app-header">
        <div>
          <p className="eyebrow">Owner controls</p>
          <h1>Settings</h1>
        </div>
        <nav aria-label="Primary navigation">
          <Link href="/">Workspace</Link>
          <Link href="/delegations">Delegations</Link>
          <Link href="/notifications">Notifications</Link>
          <LogoutButton />
        </nav>
      </header>
      <SettingsWorkspace
        initial={serializable}
        initialCollaboration={collaboration}
        initialCollaborationRuntime={serializableCollaborationRuntime}
        stages={
          JSON.parse(JSON.stringify(stages)) as NonNullable<
            Parameters<typeof SettingsWorkspace>[0]["stages"]
          >
        }
      />
    </main>
  );
}
