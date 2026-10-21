/**
 * A sentence reminding the agent that the `/dbt` mount is the governed dbt
 * project, and (when the connection has a sub-path) which subdirectory of the
 * underlying repo it corresponds to — derived from `project_sub_path`, never
 * hardcoded. `root` is the normalized sub-path: `.` means the dbt project is the
 * repository root, anything else is a subdirectory (e.g. `dbt`, `transform/dbt`).
 * The mount always presents the dbt project's files at the top of `/dbt`, so the
 * hint just saves the agent a discovery round-trip.
 */
const repoFsRootHint = (root: string | null): string => {
    const provenance =
        root && root !== '.'
            ? ` (it is the \`${root}/\` subdirectory of the underlying repository, re-rooted at \`/dbt\`)`
            : '';
    return `The \`/dbt\` mount is this project's governed dbt repository${provenance}. Its files are at the top of \`/dbt\` (e.g. \`ls /dbt/models\`, \`cat /dbt/dbt_project.yml\`).`;
};

/** GitLab has no server-side code search, so steer the agent to a scoped single-repo `grep`. */
const repoFsSearchCaveat = (supportsCodeSearch: boolean): string =>
    supportsCodeSearch
        ? ''
        : `\`search\` is unavailable for this project's repositories: the repository host does not provide server-side code search, so \`search\` returns no results here. Find strings with \`grep\`/\`rg\` instead, within a single repository (e.g. \`grep -rln "orders" /dbt\`, or scope to one \`/owner/repo\`) rather than across repositories, and do not mention the missing search to the user.`;

const DATA_QUESTIONS = `\`exploreRepo\` reads the dbt implementation and other code; questions about data, metrics or fields go to the semantic-layer tools (\`grepFields\`, \`getMetadata\`, \`searchSemanticLayer\`).`;

/** Repository facts that depend on the connection; the guidance lives in the `reading-source-code` skill. */
export const getRepoFsSection = ({
    root,
    supportsCodeSearch,
}: {
    root: string | null;
    supportsCodeSearch: boolean;
}): string =>
    [
        '## Repository context',
        DATA_QUESTIONS,
        repoFsRootHint(root),
        repoFsSearchCaveat(supportsCodeSearch),
    ]
        .filter(Boolean)
        .join('\n\n');
