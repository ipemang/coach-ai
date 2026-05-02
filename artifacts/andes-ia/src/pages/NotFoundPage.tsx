import { Link } from "wouter";

export default function NotFoundPage() {
  return (
    <div className="mosaic-bg" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", maxWidth: 480, padding: "0 24px" }}>
        <div className="ca-ornament" style={{ fontSize: 20, marginBottom: 24 }}>◆ · ◆ · ◆</div>
        <h1 className="ca-display" style={{ fontSize: 72, color: "var(--rule)", margin: "0 0 8px" }}>404</h1>
        <h2 className="ca-display" style={{ fontSize: 28, color: "var(--ink)", margin: "0 0 16px" }}>Page not found</h2>
        <p className="ca-display-italic" style={{ fontSize: 17, color: "var(--ink-soft)", lineHeight: 1.6, margin: "0 0 32px" }}>
          The path you seek is beyond the map. Perhaps the training plan changed.
        </p>
        <Link href="/" className="ca-btn ca-btn-primary" style={{ textDecoration: "none", padding: "11px 28px" }}>
          Return home →
        </Link>
      </div>
    </div>
  );
}
