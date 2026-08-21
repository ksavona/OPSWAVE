const statuses = [
  ["Application", "Foundation only"],
  ["AI access", "Fake provider"],
  ["External actions", "Disabled"],
] as const;

export const FoundationStatus = () => (
  <section aria-labelledby="foundation-status-heading" className="status-card">
    <h2 id="foundation-status-heading" hidden>
      Current foundation status
    </h2>
    {statuses.map(([label, value]) => (
      <div className="status-item" key={label}>
        <span className="status-label">{label}</span>
        <span className="status-value">{value}</span>
      </div>
    ))}
  </section>
);
