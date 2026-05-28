export const TEMPLATE_NAME = 'lightdash-ai-writeback';

// Where the repo is cloned inside the sandbox, and where the agent runs.
export const CWD = '/home/user/repo';

export const PROMPT_PATH = '/tmp/prompt.txt';
export const SYSTEM_PROMPT_PATH = '/tmp/system_prompt.txt';

// Files the agent writes for the host to open a PR from. Kept as a fallback
// — the primary channel is now structured output blocks in the agent's stdout
// (see PR_TITLE_OPEN/CLOSE etc.).
export const PR_TITLE_PATH = '/tmp/pr_title.txt';
export const PR_DESCRIPTION_PATH = '/tmp/pr_description.md';

// Structured-output delimiters. The agent emits the PR title/description in
// these XML-style blocks at the end of its final reply, the host parses them
// out of stdout for the PR, and the host strips them before showing the reply
// to the user. The tags are deliberately specific so they cannot collide with
// normal dbt or markdown content.
export const PR_TITLE_OPEN = '<lightdash-writeback-pr-title>';
export const PR_TITLE_CLOSE = '</lightdash-writeback-pr-title>';
export const PR_DESCRIPTION_OPEN = '<lightdash-writeback-pr-description>';
export const PR_DESCRIPTION_CLOSE = '</lightdash-writeback-pr-description>';

// Installation tokens authenticate over HTTPS with a fixed username.
export const GIT_USERNAME = 'x-access-token';

// Commit identity for changes the agent produces.
export const COMMIT_AUTHOR_NAME = 'Lightdash';
export const COMMIT_AUTHOR_EMAIL = 'developers@lightdash.com';

// Hard ceiling on a single synchronous run. The HTTP request is held open for
// the duration, so keep this well under typical load-balancer/proxy timeouts.
export const RUN_TIMEOUT_MS = 10 * 60 * 1000;

// How long an E2B sandbox stays alive before E2B reaps it. Used both when
// creating a sandbox and when connecting to a paused one to keep it warm.
export const SANDBOX_TIMEOUT_MS = 60 * 60 * 1000;

// Ceiling for git operations (clone/commit/push) inside the sandbox. Without
// an explicit value the E2B SDK applies a 60s default, which a slow clone can
// exceed and fail with `deadline_exceeded`. Generous, but bounded well under
// RUN_TIMEOUT_MS.
export const GIT_TIMEOUT_MS = 5 * 60 * 1000;

// Temporary copy of `profiles.yml` with Jinja env_var(...) expressions
// stripped, so `lightdash compile --skip-warehouse-catalog` can parse it
// without any runtime variables set. Kept off the repo tree so it can't
// leak into the PR.
export const TMP_PROFILES_DIR = '/tmp/ld-profiles';

// Fine-grained tool permissions for the Claude Code CLI — used in place of
// `--dangerously-skip-permissions`. Follows Claude Code's `--allowedTools`
// syntax: `Tool(specifier)`, where `//path` denotes an absolute filesystem
// path. The agent only needs:
//   - read/edit/write/glob/grep over the cloned repo at CWD
//   - read/write/edit under TMP_PROFILES_DIR (the patched profiles copy)
//   - write to the two PR metadata files the host reads after the run
//   - bash scoped to `lightdash compile` and the file ops needed to set up
//     the temporary profiles dir
export const ALLOWED_TOOLS = [
    `Read(/${CWD}/**)`,
    `Glob(/${CWD}/**)`,
    `Grep(/${CWD}/**)`,
    `Edit(/${CWD}/**)`,
    `Write(/${CWD}/**)`,
    `Read(/${TMP_PROFILES_DIR}/**)`,
    `Write(/${TMP_PROFILES_DIR}/**)`,
    `Edit(/${TMP_PROFILES_DIR}/**)`,
    // PR metadata files live directly in /tmp. This permission alone is not
    // enough: Claude Code also confines Write/Edit to the cwd workspace, so
    // /tmp must additionally be passed via `--add-dir /tmp` (see
    // runAgentInSandbox). Without that the agent's /tmp write is refused and it
    // falls back to the repo root, where the host has to scrub it.
    `Write(//tmp/**)`,
    'Bash(lightdash compile:*)',
    'Bash(mkdir:*)',
    'Bash(cp:*)',
].join(',');

// Anthropic model used for the writeback agent. Pinned to a specific Sonnet
// snapshot rather than the CLI default so runs stay deterministic across
// Claude Code releases.
export const CLAUDE_MODEL = 'claude-sonnet-4-6';
