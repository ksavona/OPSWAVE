import Link from "next/link";
import { redirect } from "next/navigation";

import { ComplianceReview } from "../../components/compliance-review";
import { LogoutButton } from "../../components/logout-button";
import { getCurrentPrincipal } from "../../server/current-session";
import { getCollaborationStore } from "../../server/runtime";

export default async function CompliancePage() {
  const principal = await getCurrentPrincipal();
  if (principal.role === "delegate") redirect("/delegated");
  const flags = await getCollaborationStore().listComplianceFlags(principal.workspaceId);
  return (
    <main className="app-page">
      <header className="app-header">
        <div>
          <p className="eyebrow">Owner controls</p>
          <h1>Compliance review</h1>
        </div>
        <nav aria-label="Primary navigation">
          <Link href="/">Workspace</Link>
          <Link href="/notifications">Notifications</Link>
          <Link href="/delegations">Delegations</Link>
          <LogoutButton />
        </nav>
      </header>
      <ComplianceReview initial={JSON.parse(JSON.stringify(flags)) as never} />
    </main>
  );
}
