export const REPO_FS_SECTION = `## Reading the dbt repository (\`repoShell\`)

This project's semantic layer is defined in a dbt repository. You have **read-only** access to its source through the \`repoShell\` tool — a limited shell exposing \`ls\`, \`cat\`, \`find\`, \`grep\` (incl. \`-l\` to list matching files), \`head\`, \`wc -l\` and \`xargs\`, which can be piped (e.g. \`grep -rln "orders" dbt/models | head\`, or \`find . -name "*.yml" | xargs grep -l orders\`). It cannot change anything.

**\`repoShell\` is not the tool for data or metric questions — the semantic-layer tools are.** For "what can I analyse / what tables, metrics, or dimensions exist", "what does this metric or dimension mean", "find or compare metrics/fields", or "are there duplicate or confusing metrics", use \`findExplores\`, \`findFields\`, and \`searchSemanticLayer\` FIRST. Those reflect the governed semantic layer the user actually queries and already carry each field's label, description, type, and SQL — grepping raw YAML/SQL instead bypasses that layer, is slower, and can surface models that aren't even exposed in Lightdash. Do not enumerate, define, or compare metrics by reading the repo.

**Use \`repoShell\` for the dbt implementation and for writeback planning** — not for the catalogue of what's queryable. Reach for it when the question is genuinely about the underlying code (how a model's SQL is built, file/project structure, dbt refs and lineage, \`dbt_project.yml\` config, CI workflows), when the semantic-layer tools genuinely cannot answer, or to read the exact files before a change. You don't need the user to mention files or commands; the dbt project may live under a subdirectory, so explore to find the right files, then read them.

**Look before you conclude.** When you do read code, do not guess at a model's contents or the cause of a compile/build error you have not read. Ground every claim in something you actually read ("\`dbt/models/orders.sql\` joins \`stg_orders\` and \`stg_payments\` via \`ref()\`"), and if what you read contradicts your assumption, revise it.

**Plan writebacks by reading first.** Before calling \`proposeWriteback\`, use \`repoShell\` to read the files you intend to change. This lets you (1) confirm a change is actually needed — if the code already does what's asked, say so instead of opening a no-op pull request; (2) name the exact target file and write a precise, self-contained edit for the writeback agent rather than a vague one; and (3) match the surrounding conventions. \`repoShell\` is read-only — it never edits files or opens pull requests; do the actual change with \`proposeWriteback\`.`;

/**
 * A sentence telling the agent where the dbt project sits in the repo, derived
 * from the project's connection `project_sub_path` (never hardcoded). `root` is
 * the normalized sub-path: `.` means the dbt project is the repository root,
 * anything else is a subdirectory (e.g. `dbt`, `transform/dbt`). Paths stay
 * repository-relative — the hint just saves the agent a discovery round-trip.
 */
export const repoFsRootHint = (root: string | null): string => {
    if (!root || root === '.') {
        return '\n\nThe dbt project is at the **repository root**, so its files are at the top level (e.g. `ls models`, `cat dbt_project.yml`).';
    }
    return `\n\nThe dbt project for this Lightdash project is rooted at \`${root}/\` within the repository — start there (e.g. \`ls ${root}\`). Paths are repository-relative, so prefix the dbt files with \`${root}/\` (e.g. \`cat ${root}/dbt_project.yml\`).`;
};
