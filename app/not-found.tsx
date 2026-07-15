import Link from "next/link";

import { PublicPageShell } from "@/components/site/PublicPageShell";

export default function NotFoundPage() {
  return (
    <PublicPageShell pageFamily="not-found" className="not-found-page">
      <section className="not-found-content" aria-labelledby="not-found-title">
        <p className="trust-eyebrow">404</p>
        <h1 className="page-title" id="not-found-title">Page not found</h1>
        <p className="page-intro">The page may have moved, or the address may be incomplete.</p>
        <div className="hero-actions">
          <Link className="button button-primary" href="/coloring-pages" prefetch={false}>Browse coloring pages</Link>
          <Link className="button button-subtle" href="/" prefetch={false}>Return home</Link>
        </div>
      </section>
    </PublicPageShell>
  );
}
