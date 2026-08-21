import type { Metadata } from "next";

import { InvitationAcceptance } from "../../../components/invitation-acceptance";

export const metadata: Metadata = {
  referrer: "no-referrer",
  robots: { follow: false, index: false },
  title: "Accept secure access | OpsWeave",
};

export default function InvitationAcceptancePage() {
  return (
    <main className="auth-page">
      <InvitationAcceptance />
    </main>
  );
}
