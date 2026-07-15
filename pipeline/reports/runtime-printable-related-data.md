# Runtime Printable Related Data

Generated: 2026-05-14T23:46:55.619Z

- Printable records: 6,352
- Related printables per record: up to 12
- Related hubs per record: up to 6

## Related printable scoring

Candidates are the deterministic union of available records in the printable's routed public hub memberships and its generated related hubs. The current item is removed. Candidates receive 1,000,000 points for sharing the primary hub, 100,000 points for every additional shared public hub, and 10,000 points multiplied by the inverse rank of each generated related hub they belong to. Higher scores sort first; asset ID ascending is the final tie-break. Selection takes unique normalized public titles first, then fills remaining slots without duplicate asset IDs, up to 12.

## Related hub scoring

Candidates must already exist as a direct printable membership, a primary-hub relatedHubId, an internal-linking target, or a parent/child relationship. Root, non-routed, non-indexable, and non-sitemap hubs are excluded. Direct membership receives 1,000,000 points; relatedHubIds receive 100,000; internal targets receive 50,000; family relationships receive 25,000; and every available member shared with the primary hub adds 100. Higher scores sort first; hub ID ascending is the final tie-break. The list is capped at six.

Canonical route fields remain frozen and do not participate in either score. Runtime randomness, build-time randomness, and external keyword data are not used.
