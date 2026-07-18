import hubsJson from "@/generated/coloring/runtime-hubs.json";
import { getCollectionCount } from "@/lib/coloring/collectionCounts";

export type SitemapHubLink = {
  label: string;
  slug: string;
  href: string;
  assetCount: number;
};

type RuntimeHubs = {
  hubs: Array<{ slug: string; title: string; route: string; assetCount: number; assetIds: string[]; indexable: boolean; sitemap: boolean }>;
};

const publicHubs = (hubsJson as RuntimeHubs).hubs
  .filter((hub) => hub.route && hub.indexable && hub.sitemap)
  .map((hub) => ({
    label: hub.title.replace(/\s+Coloring Pages$/i, ""),
    slug: hub.slug,
    href: hub.route,
    assetCount: getCollectionCount(hub),
  }));

export const sitemapRootHubLink = publicHubs.find((link) => link.href === "/coloring-pages") || null;
export const sitemapHubGroups = groupHubLinks(publicHubs.filter((link) => link.href !== "/coloring-pages"));

function groupHubLinks(links: SitemapHubLink[]) {
  const order = ["Popular", "Seasonal", "Animals & Nature", "Dinosaurs & Prehistoric", "Fantasy & Characters", "Food & Cute Objects", "Vehicles & Places", "Patterns & Detailed", "Kids & Easy", "More Collections"];
  const groups = new Map(order.map((label) => [label, [] as SitemapHubLink[]]));
  for (const link of links) groups.get(getGroup(link.slug))?.push(link);
  return order
    .map((label) => ({ label, links: (groups.get(label) || []).sort((a, b) => b.assetCount - a.assetCount || a.label.localeCompare(b.label)) }))
    .filter((group) => group.links.length > 0);
}

function getGroup(slug: string) {
  if (/^(animals|plushies|mandalas|geometric|anime-girls|chibi|fantasy|dragons|unicorns)$/.test(slug)) return "Popular";
  if (/(christmas|halloween|halloween-costume|easter|thanksgiving|valentine|seasonal|holiday|holidays|summer|winter|spring|autumn|fall|birthday|pumpkin|santa|reindeer|st-patricks|trick-or-treat|leprechaun|gingerbread)/.test(slug)) return "Seasonal";
  if (/(mandala|geometric|pattern|adult|detailed|zentangle|abstract)/.test(slug)) return "Patterns & Detailed";
  if (/(for-kids|easy|simple)/.test(slug)) return "Kids & Easy";
  if (/(bakery|cake|cupcake|cookie|food|sushi|nigiri|salmon|cute|kawaii|plushie|playing-card|chess|gingerbread)/.test(slug)) return "Food & Cute Objects";
  if (/(dinosaur|prehistoric|ankylosaurus|brachiosaurus|diplodocus|iguanodon|mosasaurus|plesiosaurus|pteranodon|pterodactyl|stegosaurus|triceratops|velociraptor|t-rex|mammoth|saber-toothed|megalodon|dodo)/.test(slug)) return "Dinosaurs & Prehistoric";
  if (/(anime|chibi|fantasy|fairy|princess|myth|dragon|monster|robot|superhero|character|unicorn|mermaid|magic|wizard|witch|griffin|hydra|phoenix|pegasus|wyvern|knight|medieval|dungeon|castle)/.test(slug)) return "Fantasy & Characters";
  if (/(animal|bird|cat|dog|terrier|bulldog|collie|horse|fish|sea|ocean|plant|flower|lily|daisy|orchid|poppy|lotus|forget-me-not|bamboo|palm|nature|farm|forest|butterfly|beetle|insect|reptile|mammal|bat|bear|bee|cow|crab|deer|dolphin|duck|eagle|elephant|fox|garden|giraffe|hedgehog|hippo|koala|lion|lizard|llama|monkey|moose|mushroom|octopus|otter|owl|panda|penguin|rabbit|rose|shark|sheep|sloth|snake|spider|tiger|tree|turtle|whale|wolf|zebra)/.test(slug)) return "Animals & Nature";
  if (/(car|vehicle|truck|train|airplane|plane|ship|boat|city|house|place|space|sports|school|bridge|building|landmark)/.test(slug)) return "Vehicles & Places";
  return "More Collections";
}
