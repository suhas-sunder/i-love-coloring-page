import type { ReactNode } from "react";

type TrustPageProps = {
  eyebrow?: string;
  title: string;
  intro: string;
  reviewNote?: string;
  children: ReactNode;
};

type TrustSectionProps = {
  title: string;
  children: ReactNode;
};

export function TrustPage({ eyebrow, title, intro, reviewNote, children }: TrustPageProps) {
  return (
    <main className="page-shell trust-page">
      <section className="trust-hero" aria-labelledby="trust-page-title">
        {eyebrow ? <p className="trust-eyebrow">{eyebrow}</p> : null}
        <h1 className="hero-title" id="trust-page-title">
          {title}
        </h1>
        <p className="hero-copy">{intro}</p>
        {reviewNote ? <p className="trust-review-note">{reviewNote}</p> : null}
      </section>
      <div className="trust-content">{children}</div>
    </main>
  );
}

export function TrustSection({ title, children }: TrustSectionProps) {
  const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  return (
    <section className="trust-section" aria-labelledby={id}>
      <h2 className="section-title" id={id}>
        {title}
      </h2>
      {children}
    </section>
  );
}
