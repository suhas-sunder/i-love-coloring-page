import type { AdPageFamily } from "@/lib/ads/types";

import { PageAdSlot } from "@/components/ads/PageAdSlot";

type SupportingInformationProps = {
  pageFamily: AdPageFamily;
  title: string;
  intro: string;
  sections: Array<{ title: string; body: string }>;
  id?: string;
};

export function SupportingInformation({ pageFamily, title, intro, sections, id = "about-this-collection" }: SupportingInformationProps) {
  const headingId = `${id}-title`;
  return (
    <section className="content-section supporting-information" id={id} aria-labelledby={headingId} data-page-section="supporting-information">
      <div className="supporting-information-copy">
        <div className="supporting-information-header">
          <h2 className="section-title" id={headingId}>{title}</h2>
          <p className="section-copy">{intro}</p>
        </div>
        <div className="supporting-information-sections">
          {sections.slice(0, 2).map((section) => (
            <section className="supporting-information-block" key={section.title}>
              <h3>{section.title}</h3>
              <p>{section.body}</p>
            </section>
          ))}
        </div>
      </div>
      <PageAdSlot pageFamily={pageFamily} placement="supporting-square" />
    </section>
  );
}
