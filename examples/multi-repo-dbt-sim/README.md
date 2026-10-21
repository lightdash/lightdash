# Synthetic multi-source dbt fixture

This is an isolated copy for exploratory preparation. It contains six small synthetic dbt repositories, deterministic three-row seeds, a generator, a local Git smart-HTTP server, and an API/CLI scenario runner.

Use the bootstrap and continuation commands in [the E1 preparation notes](../../scratch-exploratory/e1/README.md). Generated repositories, manifests, credentials, certificates, virtual environments and results stay under ignored `.work/` directories. No runtime state belongs in this branch.

The small fixture has 19 logical models, 20 physical model nodes and six seeds. It includes a project-level ring, duplicate model names, mixed reference forms, versioned models and a cross-source join. Its model graph has no cycle until a probe adds one.
