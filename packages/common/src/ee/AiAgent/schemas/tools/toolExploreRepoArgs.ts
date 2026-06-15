import { z } from 'zod';

export const TOOL_EXPLORE_REPO_DESCRIPTION = [
    "Read-only access to a GitHub repository's source code via a real bash shell restricted to a read-only command set.",
    'By default this reads the project\'s dbt repository; pass `target` ("owner/repo", e.g. "lightdash/lightdash") to read any other repository this organization can access — use `discoverRepos` first to find one. Do NOT ask the user to connect the GitHub MCP for this.',
    'Use this to INSPECT actual files before answering questions about source code, diagnosing a build/compile error, or proposing a change — do not guess at file contents or the cause of an error you have not read.',
    'This is read-only: anything that writes, deletes, runs the network, or executes scripts is unavailable and will error (use editDbtProject for changes).',
    'Available commands include file reading (`ls`, `cat <path...>` — pass MULTIPLE paths to read them in one call, `head`, `tail`, `find`, `tree`, `wc`, `stat`), search (`grep`/`egrep` with `-r`/`-i`/`-n`/`-E`/`-l` and `--include=GLOB`, `rg`), and text processing (`sed`, `awk`, `cut`, `sort`, `uniq`, `tr`, `jq`, `diff`, `xargs`).',
    'Full bash syntax works: pipes, `&&`/`||`, quoting, globs, and `2>/dev/null`.',
    'Prefer one command that does the job over many small ones: read several files with a single `cat a b c`, and locate files with one scoped command (e.g. `find . -name "*.yml" | xargs grep -l orders`) rather than repeatedly re-listing.',
    'Examples: `find models -name "*.sql" | head -n 20`, `grep -rln "stg_api_error" models`, `cat models/orders.sql | grep ref`, `find models -name "*.sql" | xargs wc -l | sort -rn | head`.',
    'For the default dbt repo, paths are relative to the dbt project root, which may itself be a subdirectory of the repository — so the dbt files are at the top level (e.g. `ls models`, `cat dbt_project.yml`); explore from there. With an explicit `target`, the WHOLE repository is readable and paths are relative to the repository root.',
].join(' ');

export const toolExploreRepoArgsSchema = z.object({
    command: z
        .string()
        .describe(
            'A single read-only bash command to run against the repository, e.g. `ls models`, `cat dbt_project.yml`, or `grep -rin "organization_events" models | head -n 30`. Standard read-only commands (ls, cat, find, grep, rg, sed, awk, cut, sort, uniq, head, tail, wc, jq, xargs, …) work, composed with pipes, `&&`/`||` and globs.',
        ),
    target: z
        .string()
        .nullable()
        .describe(
            'Optional repository to read instead of the default dbt project repo, as "owner/repo" (e.g. "lightdash/lightdash"). Use `discoverRepos` to find accessible repos. When set, the WHOLE repository is readable on its default branch (no dbt-subdirectory scoping) and paths are repository-root-relative. Pass null to read the dbt project repo exactly as before.',
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
