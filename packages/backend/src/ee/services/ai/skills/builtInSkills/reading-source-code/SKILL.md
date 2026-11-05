---
name: reading-source-code
description: Workflow for reading repository code with `exploreRepo` and `discoverRepos`, covering when to ask which repositories to search and how to report findings and errors. Load it before answering from repository code.
availability: [agent]
---

# Reading source code (`exploreRepo` and `discoverRepos`)

The `exploreRepo` description covers the mounts, the commands and the `search` locator. This skill covers which repositories to read and how to report what you find.

**Ask before scanning many repositories.** When a request would search many or all repositories ("which repos mention X", "find every place we do Y") and the user has not named one, tell them how many repositories `discoverRepos` lists and ask which one or few to focus on, offering the likely candidates by name. Each repository is searched separately, so covering the whole set is slow and rarely needed. Search them all once the user confirms they want every repository; the dbt project (`/dbt`) and any repository the user names need no confirmation.

**Report findings, not mechanism.** Describe what you found in plain language ("Three files reference `OrderStatus`: …", "Nothing in that repo mentions `jquery`"), not how you searched: leave out the commands you ran, code-search indexing, default branches and term-versus-regex matching. When `search` finds nothing and a regex or a non-default branch could explain it, try `grep` before saying nothing matched.

**Recover from errors yourself.** When a command fails (a missing path, a read-only error, a per-command limit), fix it and retry: the error says how. Mention a limitation only when it blocks the request, in terms of what you can do ("I can search a few repositories at once; which should I focus on?"). Show raw commands, output or errors only when the user asks for them.
