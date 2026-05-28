/**
 * Bash scripts that the host writes into the sandbox at runtime. Each export
 * is a function returning the rendered script body so call sites get
 * type-checked variable substitution and JSON-safe quoting at the boundary.
 */

/**
 * Pre-compute a dbt project file listing for the AI writeback agent: every
 * `*.sql` / `*.yml` / `*.yaml` path under the project, sorted. The agent
 * reads the listing as `<repo_context>` in its system prompt and `Read`s
 * individual files on demand.
 */
export const buildGatherRepoContextScript = (projectSubPath: string): string =>
    `
cd ${JSON.stringify(projectSubPath)} || { echo "(could not enter ${projectSubPath})"; exit 0; }

find . \\( -name target -o -name dbt_packages -o -name logs -o -name .git \\) -prune -o \\
  -type f \\( -name "*.sql" -o -name "*.yml" -o -name "*.yaml" \\) -print \\
  | LC_ALL=C sort
`;
