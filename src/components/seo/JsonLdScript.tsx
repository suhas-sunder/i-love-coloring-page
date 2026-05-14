import { serializeJsonLd, type JsonLdObject } from "@/lib/seo/jsonLd";

type JsonLdScriptProps = {
  data: JsonLdObject | JsonLdObject[];
  id?: string;
};

export function JsonLdScript({ data, id = "jsonld" }: JsonLdScriptProps) {
  const objects = Array.isArray(data) ? data : [data];
  const jsonLd = objects.filter((entry) => Object.keys(entry).length > 0);

  if (jsonLd.length === 0) return null;

  return (
    <script
      id={id}
      type="application/ld+json"
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd.length === 1 ? jsonLd[0] : jsonLd) }}
    />
  );
}
