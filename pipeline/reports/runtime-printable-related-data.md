# Runtime Printable Related Data

Generated: 2026-05-14T23:46:55.619Z

- Printable records: 6,352
- Related printables per record: up to 12
- Related hubs per record: up to 6

## Related printable scoring

Candidates are the deterministic union of available records in the printable's routed public hub memberships and its generated related hubs. The current item is removed. Verified specific-subject overlap ranks first, followed by direct shared collection membership and normalized strong title-token overlap. Style, season, pattern, related-hub rank, broad title tokens, shared primary collection, and orientation are progressively weaker signals. Generic terms are removed, common broad terms are downweighted, simple singular/plural forms are normalized, and stable pair distance plus asset ID provide deterministic tie-breaking. Selection excludes duplicate asset IDs and canonical destinations, takes unique normalized public titles first, and fills to 12 when valid candidates exist.

## Related hub scoring

Direct printable memberships rank first. Additional routed candidates require a strong normalized token match in the hub title or balanced repeated hub-member title evidence; inventory coverage rewards specific collections rather than raw collection size. Existing primary-hub relationships and supported family relationships remain weaker signals. Hubs below 12 printables still require direct membership, at most one thin hub may appear, and configured near-duplicate clusters contribute at most one result. The current primary collection is excluded, hub ID is the final deterministic tie-break, and the list remains capped at six.

Canonical route fields remain frozen and do not participate in either score. Runtime randomness, build-time randomness, stale internal-linking output, broad popularity, and external keyword data are not used.
