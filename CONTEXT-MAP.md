# Context Map

Glossaries of domain terms live per feature area. When code, docs, UI copy, or
agent output need a word for a domain concept, use the canonical term from the
relevant glossary — not the alternatives listed under _Avoid_.

Terms are unqualified within their own context. Outside it, qualify with the
context name (e.g. "pre-aggregate analytics", "pre-aggregate audit") to avoid
collisions with other contexts' or repo-wide meanings.

## Contexts

- [Data apps](./docs/data-apps/CONTEXT.md) — AI-generated interactive apps built on the semantic layer by a coding agent in a sandbox, versioned per prompt, found and read by the AI agent
- [Pre-aggregates](./docs/pre-aggregates/CONTEXT.md) — user-defined, pre-computed summaries of explores that serve matching queries from materialized files instead of the warehouse
- [AI agent](./docs/ai-agent/CONTEXT.md) — the in-app conversational agent (Ask AI), what users pin to its prompts, and where it opens from
- [AI agent memory](./docs/ai-agent-memory/CONTEXT.md) — per-user, per-project knowledge the AI agent distills from a user's threads and recalls on their future threads
- [External sources](./docs/external-sources/CONTEXT.md) — uploaded CSVs and connected Google Sheets ingested to typed parquet and queried as explores on the DuckDB engine
- [Merge queries](./docs/merge-queries/CONTEXT.md) — joining the results of two explore queries on a shared key, executed as a composed query with the join running in DuckDB
