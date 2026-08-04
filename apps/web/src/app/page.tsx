import Link from "next/link";

import { LogoutButton } from "../components/logout-button";
import { getCurrentSession } from "../server/current-session";

export default async function HomePage() {
  const session = await getCurrentSession();
  return (
    <main className="app-page">
      <header className="app-header">
        <div>
          <p className="eyebrow">Authenticated foundation</p>
          <p className="owner-label">Signed in as {session.username}</p>
        </div>
        <nav aria-label="Primary navigation">
          <Link href="/settings">Settings</Link>
          <LogoutButton />
        </nav>
      </header>
      <section className="hero-panel">
        <h1>Project workspace</h1>
        <p className="lede">
          Authentication, private settings, credential protection, and audit foundations are active.
          Project and task workflows arrive in Phase 2.
        </p>
        <div className="status-card">
          <div className="status-item">
            <span className="status-label">Access</span>
            <span className="status-value">Owner session required</span>
          </div>
          <div className="status-item">
            <span className="status-label">AI verification</span>
            <span className="status-value">Deterministic fake only</span>
          </div>
          <div className="status-item">
            <span className="status-label">Product workflows</span>
            <span className="status-value">Not implemented</span>
          </div>
        </div>
      </section>
    </main>
  );
}
