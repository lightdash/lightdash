export const REPO_FS_SECTION = `## Reading the dbt repository (\`repoShell\`)

This project's semantic layer is defined in a dbt repository. You have **read-only** access to its source through the \`repoShell\` tool — a real bash shell restricted to a read-only command set: file reading (\`ls\`, \`cat\`, \`head\`, \`tail\`, \`find\`, \`tree\`, \`wc\`, \`stat\`), search (\`grep\`/\`egrep\` incl. \`-r\`/\`-l\`/\`-n\`/\`-i\`/\`-E\` and \`--include=GLOB\`, \`rg\`), and text processing (\`sed\`, \`awk\`, \`cut\`, \`sort\`, \`uniq\`, \`tr\`, \`jq\`, \`diff\`, \`xargs\`, …). Full bash syntax works — pipes, \`&&\`/\`||\`, quoting, globs and \`2>/dev/null\` (e.g. \`grep -rln "orders" models | head\`, \`find . -name "*.yml" | xargs grep -l orders\`, or \`find models -name "*.sql" | xargs wc -l | sort -rn | head\` to rank files by size). It is read-only: anything that writes, deletes, runs the network, or executes scripts is unavailable and will error.

**\`repoShell\` is not the tool for data or metric questions — the semantic-layer tools are.** For "what can I analyse / what tables, metrics, or dimensions exist", "what does this metric or dimension mean", "find or compare metrics/fields", or "are there duplicate or confusing metrics", use \`findExplores\`, \`findFields\`, and \`searchSemanticLayer\` FIRST. Those reflect the governed semantic layer the user actually queries and already carry each field's label, description, type, and SQL — grepping raw YAML/SQL instead bypasses that layer, is slower, and can surface models that aren't even exposed in Lightdash. Do not enumerate, define, or compare metrics by reading the repo.

**Use \`repoShell\` for the dbt implementation and for writeback planning** — not for the catalogue of what's queryable. Reach for it when the question is genuinely about the underlying code (how a model's SQL is built, file/project structure, dbt refs and lineage, \`dbt_project.yml\` config, CI workflows), when the semantic-layer tools genuinely cannot answer, or to read the exact files before a change. You don't need the user to mention files or commands; the dbt project may live under a subdirectory, so explore to find the right files, then read them.

**Work in as few commands as possible.** Locate files with one scoped command (e.g. \`find . -name "*.yml" | xargs grep -l <token>\`) and trust its result instead of re-listing the tree; then read every file you need in a single \`cat fileA fileB fileC\` rather than one \`cat\` per file. Each round-trip is slow, so batch.

**Look before you conclude.** When you do read code, do not guess at a model's contents or the cause of a compile/build error you have not read. Ground every claim in something you actually read ("\`dbt/models/orders.sql\` joins \`stg_orders\` and \`stg_payments\` via \`ref()\`"), and if what you read contradicts your assumption, revise it.

**Plan writebacks by reading first.** Before calling \`editDbtProject\`, use \`repoShell\` to read the files you intend to change. This lets you (1) confirm a change is actually needed — if the code already does what's asked, say so instead of opening a no-op pull request; (2) name the exact target file and write a precise, self-contained edit for \`editDbtProject\` rather than a vague one; and (3) match the surrounding conventions. \`repoShell\` is read-only — it never edits files or opens pull requests; do the actual change with \`editDbtProject\`.`;

/**
 * A sentence telling the agent where the dbt project sits in the repo, derived
 * from the project's connection `project_sub_path` (never hardcoded). `root` is
 * the normalized sub-path: `.` means the dbt project is the repository root,
 * anything else is a subdirectory (e.g. `dbt`, `transform/dbt`). Paths stay
 * repository-relative — the hint just saves the agent a discovery round-trip.
 */
export const repoFsRootHint = (root: string | null): string => {
    const scope =
        root && root !== '.'
            ? `\`repoShell\` is scoped to the dbt project (the repo's \`${root}/\` directory) — you cannot read files outside it.`
            : '`repoShell` reads the dbt project at the repository root.';
    return `\n\n${scope} Paths are relative to the dbt project root, so its files are at the top level (e.g. \`ls models\`, \`cat dbt_project.yml\`).`;
};
