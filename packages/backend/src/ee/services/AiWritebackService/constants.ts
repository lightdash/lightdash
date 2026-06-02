// Where the repo is cloned inside the sandbox, and where the agent runs.
export const CWD = '/home/user/repo';

export const PROMPT_PATH = '/tmp/prompt.txt';
export const SYSTEM_PROMPT_PATH = '/tmp/system_prompt.txt';

// Warehouse-specific guidance the host pushes into the sandbox before the agent
// runs. Kept OUTSIDE the cloned repo (CWD) so `git add --all` can't sweep them
// into the PR. The agent reads them on demand — the system prompt points it
// here before any `type:`/SQL edit that changes a column's emitted type.
export const SKILLS_DIR = '/home/user/.lightdash-skills';
export const WAREHOUSE_SKILL_PATH = `${SKILLS_DIR}/warehouse.md`;
export const SHARED_SKILL_PATH = `${SKILLS_DIR}/shared.md`;

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

export const CO_AUTHOR_TRAILER = `Co-authored-by: ${COMMIT_AUTHOR_NAME} <${COMMIT_AUTHOR_EMAIL}>`;

// Hard ceiling on a single synchronous run. The HTTP request is held open for
// the duration, so keep this well under typical load-balancer/proxy timeouts.
export const RUN_TIMEOUT_MS = 20 * 60 * 1000;

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

// Wrapper the agent runs instead of `lightdash compile` directly. It strips
// secrets from the environment before exec'ing the real compile, so a
// malicious dbt model cannot read them via Jinja `env_var(...)` during the
// compile (the agent process holds ANTHROPIC_API_KEY to authenticate the CLI,
// and bash children would otherwise inherit it). The agent is allowlisted to
// this wrapper only — not raw `lightdash compile` — so the scrub is enforced
// regardless of what the agent decides to run. Written into the sandbox at
// runtime by runAgentInSandbox.
export const COMPILE_WRAPPER_PATH = '/tmp/ld-writeback-compile';

// Environment variables stripped from the compile child by the wrapper above.
// ANTHROPIC_API_KEY is the only secret currently in the agent's env, but we
// also drop common token vars defensively in case that changes.
export const COMPILE_STRIPPED_ENV_VARS = [
    'ANTHROPIC_API_KEY',
    'GITHUB_TOKEN',
    'GH_TOKEN',
];

// Fine-grained tool permissions for the Claude Code CLI — used in place of
// `--dangerously-skip-permissions`. Follows Claude Code's `--allowedTools`
// syntax: `Tool(specifier)`, where `//path` denotes an absolute filesystem
// path. The agent only needs:
//   - read/edit/write/glob/grep over the cloned repo at CWD
//   - read/write/edit under TMP_PROFILES_DIR (the patched profiles copy)
//   - write to the two PR metadata files the host reads after the run
//   - bash scoped to the compile wrapper (COMPILE_WRAPPER_PATH) and the file
//     ops needed to set up the temporary profiles dir
export const ALLOWED_TOOLS = [
    `Read(/${CWD}/**)`,
    `Glob(/${CWD}/**)`,
    `Grep(/${CWD}/**)`,
    `Edit(/${CWD}/**)`,
    `Write(/${CWD}/**)`,
    `Read(/${TMP_PROFILES_DIR}/**)`,
    `Write(/${TMP_PROFILES_DIR}/**)`,
    `Edit(/${TMP_PROFILES_DIR}/**)`,
    // Read-only access to the warehouse skill files. Like /tmp below, the
    // skills dir also has to be passed via `--add-dir` (see runAgentInSandbox)
    // or Claude Code confines reads to the cwd workspace and refuses these.
    `Read(/${SKILLS_DIR}/**)`,
    // PR metadata files live directly in /tmp. This permission alone is not
    // enough: Claude Code also confines Write/Edit to the cwd workspace, so
    // /tmp must additionally be passed via `--add-dir /tmp` (see
    // runAgentInSandbox). Without that the agent's /tmp write is refused and it
    // falls back to the repo root, where the host has to scrub it.
    `Write(//tmp/**)`,
    // Compile only via the secret-stripping wrapper, never raw
    // `lightdash compile` — see COMPILE_WRAPPER_PATH.
    `Bash(${COMPILE_WRAPPER_PATH}:*)`,
    'Bash(mkdir:*)',
    'Bash(cp:*)',
].join(',');

// Anthropic model used for the writeback agent. Pinned to a specific Sonnet
// snapshot rather than the CLI default so runs stay deterministic across
// Claude Code releases.
export const CLAUDE_MODEL = 'claude-sonnet-4-6';

// Ceiling on the gather pass itself. The shell pipeline is sub-second on
// typical repos; this guards against an unusually large checkout taking long
// enough to eat into the agent budget.
export const REPO_CONTEXT_TIMEOUT_MS = 30 * 1000;

// Where the host writes the repo-context gathering script inside the sandbox
// before running it (see buildGatherRepoContextScript).
export const GATHER_REPO_CONTEXT_SANDBOX_PATH = '/tmp/gather-repo-context.sh';

// Last N bytes of the agent's stderr kept for diagnostics on a non-zero exit /
// timeout, so the Sentry payload carries the real error without inflating it.
export const STDERR_TAIL_BYTES = 4096;

// Synthetic prompt for the dedicated preview-deploy setup run. It leans on the
// "Secondary task" section that run()'s system prompt already injects (with the
// exact workflow files + secrets) when the repo has no preview-deploy workflow.
export const PREVIEW_DEPLOY_SETUP_PROMPT = [
    'The user has agreed to set up Lightdash preview deploys for this project.',
    'Your ONLY task this run is to add the Lightdash preview-deploy GitHub Actions workflow described in the "Secondary task: offer to set up Lightdash preview deploys" section of your instructions.',
    'Keep the workflow structure exactly as shown in that section — the permissions blocks, secret names, lightdash commands, and job/trigger layout are security-reviewed and run with live credentials, so do NOT widen permissions, rename the files, or change the commands. You MAY adapt only the version pinning (action refs, Node version, @lightdash/cli version): use the versions shown by default, but if the repo already has a consistent version-pinning convention in its other .github/workflows files, match it instead. Do NOT modify any dbt models, YAML, or other files.',
    'In your final reply, list the GitHub Actions repository secrets the user must add for the workflow to run.',
].join(' ');
