import { FoundationStatus } from "../components/foundation-status";

export default function HomePage() {
  return (
    <main>
      <p className="eyebrow">Foundation phase</p>
      <h1>Operational clarity, with humans in control.</h1>
      <p className="lede">
        OpsWeave is establishing its engineering and security foundations. Project management, AI
        intake, and planning workflows are not implemented yet.
      </p>
      <FoundationStatus />
    </main>
  );
}
