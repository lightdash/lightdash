# Agent loadouts are one base plus additive add-ons

The AI agent's tool set and system prompt sections are resolved once per run
by a pure loadout resolver: one mutually exclusive base that owns the query
path (classic, composer, no data access, deep research worker, deep research
coordinator) plus add-ons that each contribute disjoint tools and at most one
prompt section, combined by union. Until now three hand-written lists
(`getAgentTools`, `getCapabilitySections`, and the intent gate's
section-to-tool map) each re-interpreted about twenty booleans, nothing named
a combination, and two fixtures pinned the result; retiring `runQuery`,
`generateVisualization` and `runSql` behind the composer flag would have meant
editing all three lists with no test naming the miss. Named profiles per
combination were rejected because our combinations are products of
independent organization settings and would multiply; composable sets alone
were rejected because the query path is not additive and would leave
"whichever query tool survived the union" ambiguous. The layered shape keeps
the few exclusive decisions in the base and the many independent ones as
add-ons, which is what Claude Code's preset plus append, Copilot's agent file
plus instruction files, and ADK's agent plus toolsets do implicitly. The
constraints are deliberate: no mixed query paths (a hybrid is a new base),
query-path variants are branches inside the base rather than add-ons, a tool
lives in exactly one base or add-on, add-ons depend on each other only through
their conditions, and per-turn overlays only remove. In exchange, one contract
snapshot per base, one per add-on, and one per base with every add-on cover
the space, roughly twenty-three snapshots instead of a matrix. The resolver
always yields a base, classic by default, and never throws, so a flag turning
off can only shrink a loadout, never fail a run.
