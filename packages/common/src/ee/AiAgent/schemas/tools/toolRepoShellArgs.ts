import { z } from 'zod';

export const TOOL_REPO_SHELL_DESCRIPTION = [
    "Read-only access to this project's dbt repository source code via a real bash shell restricted to a read-only command set.",
    'Use this to INSPECT the actual files before answering questions about the dbt project, diagnosing a build/compile error, or proposing a change — do not guess at file contents or the cause of an error you have not read.',
    'This is read-only: anything that writes, deletes, runs the network, or executes scripts is unavailable and will error (use proposeWriteback for changes).',
    'Available commands include file reading (`ls`, `cat <path...>` — pass MULTIPLE paths to read them in one call, `head`, `tail`, `find`, `tree`, `wc`, `stat`), search (`grep`/`egrep` with `-r`/`-i`/`-n`/`-E`/`-l` and `--include=GLOB`, `rg`), and text processing (`sed`, `awk`, `cut`, `sort`, `uniq`, `tr`, `jq`, `diff`, `xargs`).',
    'Full bash syntax works: pipes, `&&`/`||`, quoting, globs, and `2>/dev/null`.',
    'Prefer one command that does the job over many small ones: read several files with a single `cat a b c`, and locate files with one scoped command (e.g. `find . -name "*.yml" | xargs grep -l orders`) rather than repeatedly re-listing.',
    'Examples: `find models -name "*.sql" | head -n 20`, `grep -rln "stg_api_error" models`, `cat models/orders.sql | grep ref`, `find models -name "*.sql" | xargs wc -l | sort -rn | head`.',
    'Paths are relative to the dbt project root, which may itself be a subdirectory of the repository — so the dbt files are at the top level (e.g. `ls models`, `cat dbt_project.yml`); explore from there rather than assuming a repo-root layout.',
].join(' ');

export const toolRepoShellArgsSchema = z.object({
    command: z
        .string()
        .describe(
            'A single read-only bash command to run against the repository, e.g. `ls models`, `cat dbt_project.yml`, or `grep -rin "organization_events" models | head -n 30`. Standard read-only commands (ls, cat, find, grep, rg, sed, awk, cut, sort, uniq, head, tail, wc, jq, xargs, …) work, composed with pipes, `&&`/`||` and globs.',
        ),
});

export const toolRepoShellOutputSchema = z.object({
    result: z.string(),
    metadata: z.object({
        status: z.enum(['success', 'error']),
    }),
});

export type ToolRepoShellArgs = z.infer<typeof toolRepoShellArgsSchema>;

export type ToolRepoShellOutput = z.infer<typeof toolRepoShellOutputSchema>;
