import { z } from 'zod';

export const TOOL_EXPLORE_REPO_DESCRIPTION = [
    'Read-only access to source code via a real bash shell restricted to a read-only command set, over a single virtual filesystem that mounts every repository this organization can access.',
    'The dbt project is mounted at `/dbt` (its files at the top, e.g. `/dbt/dbt_project.yml`, `/dbt/models`). Every other accessible repository is mounted whole on its default branch at `/<owner>/<repo>` (e.g. `/lightdash/lightdash`). Run `ls /` to see what is mounted, or use `discoverRepos` to list repositories. Do NOT ask the user to connect the GitHub MCP for this.',
    'The `target` argument only sets your starting directory: an "owner/repo" target starts you in `/owner/repo`; no target starts you in `/dbt`. Absolute paths reach any mount, so one command can span repositories.',
    'Use this to INSPECT actual files before answering questions about source code, diagnosing a build/compile error, or proposing a change — do not guess at file contents or the cause of an error you have not read.',
    'This is read-only: anything that writes, deletes, runs the network, or executes scripts is unavailable and will error (use editDbtProject for changes).',
    'Available commands include file reading (`ls`, `cat <path...>` — pass MULTIPLE paths to read them in one call, `head`, `tail`, `find`, `tree`, `wc`, `stat`), search (`grep`/`egrep` with `-r`/`-i`/`-n`/`-E`/`-l` and `--include=GLOB`, `rg`), and text processing (`sed`, `awk`, `cut`, `sort`, `uniq`, `tr`, `jq`, `diff`, `xargs`).',
    'Full bash syntax works: pipes, `&&`/`||`, quoting, globs, and `2>/dev/null`.',
    'Prefer one command that does the job over many small ones: read several files with a single `cat a b c`, and locate files with one scoped command (e.g. `find /dbt -name "*.yml" | xargs grep -l orders`) rather than repeatedly re-listing. Trees are fetched lazily per repository, so target a specific mount rather than an unscoped `grep -r /` across everything.',
    'Examples: `cat dbt_project.yml` (from the default `/dbt` start), `grep -rln "stg_api_error" /dbt/models`, `find /lightdash/lightdash/packages/common -name "*.ts" | head -n 20`.',
].join(' ');

export const toolExploreRepoArgsSchema = z.object({
    command: z
        .string()
        .describe(
            'A single read-only bash command to run against the virtual filesystem, e.g. `ls /`, `cat dbt_project.yml`, or `grep -rin "organization_events" /dbt/models | head -n 30`. Standard read-only commands (ls, cat, find, grep, rg, sed, awk, cut, sort, uniq, head, tail, wc, jq, xargs, …) work, composed with pipes, `&&`/`||` and globs. Use absolute paths (`/dbt/...`, `/owner/repo/...`) to read across repositories.',
        ),
    target: z
        .string()
        .nullable()
        .describe(
            'Optional starting directory, as a repository "owner/repo" (e.g. "lightdash/lightdash") — the command then starts in that repository\'s mount (`/owner/repo`). Use `discoverRepos` to find accessible repos. Pass null to start in the dbt project mount (`/dbt`). This only sets the working directory; absolute paths in the command can reach any mount regardless of target.',
        ),
});

export const toolExploreRepoOutputSchema = z.object({
    result: z.string(),
    metadata: z.object({
        status: z.enum(['success', 'error']),
    }),
});

export type ToolExploreRepoArgs = z.infer<typeof toolExploreRepoArgsSchema>;

export type ToolExploreRepoOutput = z.infer<typeof toolExploreRepoOutputSchema>;
