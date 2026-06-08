import { z } from 'zod';

export const TOOL_REPO_SHELL_DESCRIPTION = [
    "Read-only access to this project's dbt repository source code via a limited shell.",
    'Use this to INSPECT the actual files before answering questions about the dbt project, diagnosing a build/compile error, or proposing a change — do not guess at file contents or the cause of an error you have not read.',
    'This is read-only: it cannot edit files or open pull requests (use proposeWriteback for changes).',
    'Supported commands: `ls [path]`, `cat <path...>` (pass MULTIPLE paths to read them in one call, e.g. `cat models/a.yml models/b.yml`), `find [path] [-name <glob>] [-type f]`, `grep [-r] [-i] [-n] [-E] [-l] <pattern> [path...]` (`-l` lists matching file names), `head [-n N]`, `wc -l`, and `xargs <command>` (appends piped lines as arguments).',
    'Prefer one command that does the job over many small ones: read several files with a single `cat a b c`, and locate files with one scoped command (e.g. `find . -name "*.yml" | xargs grep -l orders`) rather than repeatedly re-listing.',
    'Commands can be piped, e.g. `find models -name "*.sql" | head -n 20`, `grep -rln "stg_api_error" models`, `cat models/orders.sql | grep ref`.',
    'Only those commands and flags are implemented — other shell features (sed, awk, redirection, subshells, &&) are NOT available.',
    'Paths are relative to the dbt project root, which may itself be a subdirectory of the repository — so the dbt files are at the top level (e.g. `ls models`, `cat dbt_project.yml`); explore from there rather than assuming a repo-root layout.',
].join(' ');

export const toolRepoShellArgsSchema = z.object({
    command: z
        .string()
        .describe(
            'A single read-only shell command to run against the repository, e.g. `ls models`, `cat dbt_project.yml`, or `grep -rin "organization_events" models | head -n 30`. Only ls/cat/find/grep/head/wc are supported, optionally chained with pipes.',
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
