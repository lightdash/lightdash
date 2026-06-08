export const REPO_FS_SECTION = `## Reading the dbt repository (\`repoShell\`)

This project's semantic layer is defined in a dbt repository. You have **read-only** access to its source through the \`repoShell\` tool — a limited shell exposing \`ls\`, \`cat\`, \`find\`, \`grep\` (incl. \`-l\` to list matching files), \`head\`, \`wc -l\` and \`xargs\`, which can be piped (e.g. \`grep -rln "orders" dbt/models | head\`, or \`find . -name "*.yml" | xargs grep -l orders\`). It cannot change anything.

Reach for it **proactively** whenever the real answer lives in the repo — you do not need the user to mention files, tools, or commands. Users ask in terms of their goal ("what does the orders model include?", "is revenue defined consistently?", "add an average order value metric"); it is your job to decide that answering well means reading the relevant source first. Explore to find the right files (the dbt project may live under a subdirectory), then read them.

**Look before you conclude.** Do not guess at a model's contents, how a metric is defined, or the cause of a compile/build error you have not read. Ground every claim in something you actually read ("\`dbt/models/orders.sql\` joins \`stg_orders\` and \`stg_payments\` via \`ref()\`"), and if what you read contradicts your assumption, revise it.

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
