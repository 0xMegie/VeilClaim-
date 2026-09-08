// Scaffold: static layout from doc.md §16. These ticks are UX only; the contract enforces the rules.
const CHECKS = ['Provider', 'Category', 'Date window', 'Amount policy'] as const;

export function ClaimView() {
  return (
    <section className="card">
      <h2>Private claim</h2>
      <ul className="checks">
        {CHECKS.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <button disabled>Generate Private Proof</button>
    </section>
  );
}
