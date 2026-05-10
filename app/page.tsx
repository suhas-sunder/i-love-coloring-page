import Link from "next/link";

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hub-hero">
        <div className="hero-copy">
          <h1 className="sky-heading">I Love Coloring Page</h1>
          <p>Browse the public gallery foundation built from approved coloring page hubs.</p>
          <div className="hero-stats">
            <span>Hub-based browsing</span>
            <span>No image detail pages</span>
          </div>
          <p>
            <Link className="button button-primary" href="/coloring-pages">
              Open Coloring Pages
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
