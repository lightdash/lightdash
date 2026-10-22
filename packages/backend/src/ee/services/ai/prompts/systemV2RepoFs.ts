/**
 * Names the `/dbt` mount as the governed dbt project and, for a sub-path root, which
 * repository subdirectory it is. `root` is the normalized `project_sub_path`; `.` is the repository root.
 */
const repoFsRootHint = (root: string | null): string => {
    const provenance =
        root && root !== '.'
            ? ` (it is the \`${root}/\` subdirectory of the underlying repository, re-rooted at \`/dbt\`)`
            : '';
    return `The \`/dbt\` mount is this project's governed dbt repository${provenance}.`;
};

/** GitLab has no server-side code search, so steer the agent to a scoped single-repo `grep`. */
const repoFsSearchCaveat = (supportsCodeSearch: boolean): string =>
    supportsCodeSearch
        ? ''
        : `\`search\` is unavailable for this project's repositories: the host has no server-side code search. Find strings with \`grep\`/\`rg\` inside one repository (e.g. \`grep -rln "orders" /dbt\`), without mentioning the missing search to the user.`;

const DATA_QUESTIONS = `\`exploreRepo\` reads the dbt implementation and other code; questions about data, metrics or fields go to the semantic-layer tools (\`grepFields\`, \`getMetadata\`, \`searchSemanticLayer\`), which show what users can query, while the repository can hold models Lightdash does not expose.`;

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
