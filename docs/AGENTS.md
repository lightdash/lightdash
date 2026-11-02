# /docs

Central place for developer documentation — technical references, architecture docs, and specs that live alongside the code.

## When to create a doc

A doc holds what the code can't tell a reader: the why, the unwritten convention, the gotcha.

- Cross-cutting concerns that span multiple packages or services (e.g., timezone handling, authorization)
- Non-obvious system behavior that would take significant code reading to understand
- Decision records for architectural choices where the "why" matters

Never check in plans, research, or facts derivable from code (file lists, signatures, what a function does). They go stale fast. Keep them in `.local/` (gitignored) or the PR description.

## Standards

- **Naming**: `<topic-slug>.md` using lowercase kebab-case (e.g., `timezone-handling.md`)
- **Subdirectories**: Group related docs by topic when there are 3+ docs on the same subject (e.g., `docs/timezones/`)
- **Structure**: Start with context/purpose, explain the non-obvious behavior with pointers to code locations, include examples where helpful
- **Keep current**: Update docs when the code they describe changes significantly. If a doc is no longer accurate, update or delete it.
- **Not for**: API docs (generated from TSOA), user-facing docs (separate docs site)
