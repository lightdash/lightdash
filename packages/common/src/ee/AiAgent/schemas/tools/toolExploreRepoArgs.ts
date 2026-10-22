import { z } from 'zod';
import { structuredToolOutputSchema } from '../outputMetadata';

export const TOOL_EXPLORE_REPO_DESCRIPTION = [
    "Run one read-only bash command over a virtual filesystem of repositories: this project's dbt project at `/dbt` (its files at the top, e.g. `/dbt/models`, `/dbt/dbt_project.yml`) and every repository `discoverRepos` lists, whole on its default branch, at `/<owner>/<repo>`. `ls /` shows the mounts. Read repositories with this tool rather than asking the user to connect a GitHub MCP server.",
    "Use it to read the code before answering questions about it (a model's SQL, refs and lineage, project config, CI workflows), diagnosing a build or compile error, or proposing a change, and ground each claim in a file you read.",
    'Commands: `ls`, `cat`, `head`, `tail`, `find`, `tree`, `wc`, `stat`, `grep`/`egrep` (incl. `-r`, `-l`, `-E`, `--include=GLOB`), `rg`, `sed`, `awk`, `cut`, `sort`, `uniq`, `tr`, `jq`, `diff`, `xargs`, with pipes, `&&`/`||`, quoting, globs and `2>/dev/null`.',
    "`search <term> [path]` lists the files that contain a term, using the host's code search; the path picks one repository (`/dbt`, `/owner/repo`), a subdirectory, or every repository of an owner (`/owner`, one request each). It matches terms, not regular expressions, and indexes only default branches and files under a size cap: locate files with it, and use `grep`/`rg` for a regex, a non-default branch or matching lines in a known directory.",
    "Walks download what they touch (`grep -r` and `rg` every file, `find`, `ls -R` and `tree` every repository they enter), so one across repositories or over a whole large repository exhausts the provider's rate limit for the rest of the conversation, and the server stops a command that reads too many files. Keep walks inside one repository and directory, and find which files or repositories mention a string with `search`.",
    'Use as few commands as possible: locate files with one scoped command (e.g. `find /dbt -name "*.yml" | xargs grep -l orders`) and read them all with one `cat a b c`.',
].join(' ');

export const toolExploreRepoArgsSchema = z.object({
    command: z
        .string()
        .describe(
            'One read-only bash command, e.g. `ls /`, `cat dbt_project.yml`, or `grep -rin "organization_events" /dbt/models | head -n 30`.',
        ),
    target: z
        .string()
        .nullable()
        .describe(
            'Starting directory as a repository "owner/repo" (e.g. "acme/analytics"), which starts the command in `/owner/repo`; null starts it in `/dbt`. Absolute paths reach any mount whatever the target, so one command can read named files from several repositories (e.g. `diff /dbt/models/orders.sql /acme/analytics/models/orders.sql`).',
        ),
});

export const toolExploreRepoStructuredContentSchema = z.object({
    output: z
        .string()
        .describe(
            'The command output exactly as shown in `result`: stdout (clamped to the output limit), followed by any stderr diagnostic and truncation notes.',
        ),
});

export const toolExploreRepoOutputSchema = structuredToolOutputSchema({
    metadata: z.object({
        status: z.enum(['success', 'error']),
    }),
    structuredContent: toolExploreRepoStructuredContentSchema,
});

export type ToolExploreRepoArgs = z.infer<typeof toolExploreRepoArgsSchema>;

export type ToolExploreRepoStructuredContent = z.infer<
    typeof toolExploreRepoStructuredContentSchema
>;

export type ToolExploreRepoOutput = z.infer<typeof toolExploreRepoOutputSchema>;
