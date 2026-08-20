# Context Map

Glossaries of domain terms live per feature area. When code, docs, UI copy, or
agent output need a word for a domain concept, use the canonical term from the
relevant glossary — not the alternatives listed under _Avoid_.

Terms are unqualified within their own context. Outside it, qualify with the
context name (e.g. "pre-aggregate analytics", "pre-aggregate audit") to avoid
collisions with other contexts' or repo-wide meanings.

## Contexts

- [Pre-aggregates](./docs/pre-aggregates/CONTEXT.md) — user-defined, pre-computed summaries of explores that serve matching queries from materialized files instead of the warehouse
- [AI agent memory](./docs/ai-agent-memory/CONTEXT.md) — per-user, per-project knowledge the AI analyst distills from a user's threads and recalls on their future threads
