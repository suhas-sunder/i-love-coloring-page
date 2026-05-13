import Link from "next/link";

import type { SeoPageContent } from "@/lib/coloring/types";

type SeoContentSectionProps = {
  content: SeoPageContent | null;
  id?: string;
};

export function SeoContentSection({ content, id = "about-this-collection" }: SeoContentSectionProps) {
  if (!content) return null;

  const headingId = `${content.pageType}-guide`;

  return (
    <section className="content-section seo-content-section" id={id} aria-labelledby={headingId}>
      <div className="seo-content-header">
        <h2 className="section-title" id={headingId}>
          {content.guideTitle}
        </h2>
        <p className="section-copy">{content.shortIntro}</p>
      </div>

      <div className="seo-content-grid">
        {content.belowGallerySections.map((section) => (
          <section className="seo-content-block" key={section.heading} aria-labelledby={`${headingId}-${slugify(section.heading)}`}>
            <h3 id={`${headingId}-${slugify(section.heading)}`}>{section.heading}</h3>
            <p>{section.body}</p>
            {section.items?.length ? (
              <ul>
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>

      {content.relatedHubLinks.length > 0 ? (
        <nav className="seo-related-links" aria-label="Related coloring page collections">
          <h3>Related collections</h3>
          <div className="seo-related-link-list">
            {content.relatedHubLinks.map((link) => (
              <Link className="seo-related-link" href={link.href} key={link.href} prefetch={false}>
                <span>{link.label}</span>
                <strong>{link.assetCount.toLocaleString()}</strong>
              </Link>
            ))}
          </div>
        </nav>
      ) : null}
    </section>
  );
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
