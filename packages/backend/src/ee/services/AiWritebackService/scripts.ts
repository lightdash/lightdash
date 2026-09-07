import { COMPILE_STRIPPED_ENV_VARS } from './constants';
import { quoteShellArgument } from './utils';

/**
 * Bash scripts that the host writes into the sandbox at runtime. Each export
 * is a function returning the rendered script body so call sites get
 * type-checked variable substitution and JSON-safe quoting at the boundary.
 */

/**
 * Command the host runs to check that the dbt project still parses: `dbt parse`
 * with the project's dbt venv on PATH and secrets stripped from the child, the
 * same hardening the agent's compile wrapper applies (a malicious model must not
 * be able to read them via Jinja `env_var(...)` during the parse).
 *
 * `--profiles-dir` points at the credential-free profiles copy the host stages,
 * so the parse needs no warehouse connection and no environment variables.
 */
export const buildDbtParseCommand = ({
    dbtBin,
    projectDir,
    profilesDir,
}: {
    dbtBin: string;
    projectDir: string;
    profilesDir: string;
}): string => {
    const unsetFlags = COMPILE_STRIPPED_ENV_VARS.map(
        (name) => `-u ${name}`,
    ).join(' ');
    return (
        `env ${unsetFlags} PATH="${dbtBin}:$PATH" dbt parse ` +
        `--project-dir ${quoteShellArgument(projectDir)} ` +
        `--profiles-dir ${quoteShellArgument(profilesDir)}`
    );
};

/**
 * Pre-compute a dbt project file listing for the AI writeback agent: every
 * `*.sql` / `*.yml` / `*.yaml` path under the project, sorted. The agent
 * reads the listing as `<repo_context>` in its system prompt and `Read`s
 * individual files on demand.
 */
export const buildGatherRepoContextScript = (
    projectSubPath: string,
): string => {
    const quotedPath = quoteShellArgument(projectSubPath);
    const quotedError = quoteShellArgument(
        `(could not enter ${projectSubPath})`,
    );
    return `
cd ${quotedPath} || { echo ${quotedError}; exit 0; }

find . \\( -name target -o -name dbt_packages -o -name logs -o -name .git \\) -prune -o \\
  -type f \\( -name "*.sql" -o -name "*.yml" -o -name "*.yaml" \\) -print \\
  | LC_ALL=C sort
`;
};
