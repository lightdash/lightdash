// Where the repo is cloned inside the sandbox, and where the agent runs.
export const CWD = '/home/user/repo';

// Each supported dbt version is installed in its own venv at
// `${DBT_VENV_BIN_PREFIX}<X.Y>/bin` in the sandbox image (see
// sandboxes/ai-writeback/e2b.Dockerfile). The compile wrapper prepends the
// project's venv bin to PATH so the bare `dbt` the Lightdash CLI invokes
// resolves to the project's configured version. See `dbtSandboxVenvBin`.
export const DBT_VENV_BIN_PREFIX = '/usr/local/dbt';

export const PROMPT_PATH = '/tmp/prompt.txt';
export const SYSTEM_PROMPT_PATH = '/tmp/system_prompt.txt';

// Warehouse-specific guidance the host pushes into the sandbox before the agent
// runs. Kept OUTSIDE the cloned repo (CWD) so `git add --all` can't sweep them
// into the PR. The agent reads them on demand — the system prompt points it
// here before any `type:`/SQL edit that changes a column's emitted type.
export const SKILLS_DIR = '/home/user/.lightdash-skills';
export const WAREHOUSE_SKILL_PATH = `${SKILLS_DIR}/warehouse.md`;
export const SHARED_SKILL_PATH = `${SKILLS_DIR}/shared.md`;

// Claude Code Agent Skills baked into the sandbox image at build time via
// `lightdash install-skills` (see sandboxes/ai-writeback/e2b.Dockerfile). The
// agent runs as `user`, so this matches the runtime ~/.claude/skills location
// Claude Code auto-discovers. Distinct from SKILLS_DIR above (the host-pushed
// warehouse markdown). The agent reads a skill's resource files from here, so
// it must be both allowlisted (ALLOWED_TOOLS) and passed via --add-dir.
export const CLAUDE_SKILLS_DIR = '/home/user/.claude/skills';

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
export const PR_SUMMARY_OPEN = '<lightdash-writeback-pr-summary>';
export const PR_SUMMARY_CLOSE = '</lightdash-writeback-pr-summary>';

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

// The compile wrapper appends one `<elapsedMs> <exitCode>` line per invocation
// here, so runAgentInSandbox can report how much of the agent stage was spent in
// `lightdash compile` (the prime suspect for writeback latency) vs the LLM/edits.
export const COMPILE_TIMINGS_PATH = '/tmp/ld-writeback-compile-timings';

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
    // Invoke the Lightdash Agent Skills installed in the image, and read the
    // resource files they reference. Like the dirs above, CLAUDE_SKILLS_DIR is
    // outside the cwd workspace so it must also be passed via `--add-dir`.
    'Skill',
    `Read(/${CLAUDE_SKILLS_DIR}/**)`,
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

// Host-curated Agent Skills directory for the GENERAL coding agent, distinct
// from the dbt warehouse skills (SKILLS_DIR) and the baked-in Claude skills
// (CLAUDE_SKILLS_DIR). Shipped near-empty for v1; lives OUTSIDE the cloned repo
// (CWD) so `git add` can never sweep its contents into a PR. Safe to expose
// read-only because the general agent has no Bash — skills can't execute.
export const GENERAL_SKILLS_DIR = '/home/user/.lightdash-coding-skills';

// Read paths DENIED to the general coding agent even though they fall under the
// `Read(/CWD/**)` allow — applied via Claude Code `--disallowedTools`. Excludes
// `.git` (clone remote/creds + git internals) so the agent can't lift a token
// from `.git/config` and exfiltrate it via the PR (R4), and common secret files
// so it can't read+leak them (R6). Defense-in-depth: the clone token is already
// scoped + scrubbed + revoked, and secrets are denied at commit time too.
export const GENERAL_DISALLOWED_TOOLS = [
    `Read(/${CWD}/.git/**)`,
    `Read(/${CWD}/.env)`,
    `Read(/${CWD}/.env.*)`,
    `Read(/${CWD}/**/.env)`,
    `Read(/${CWD}/**/.env.*)`,
    `Read(/${CWD}/**/*.pem)`,
    `Read(/${CWD}/**/*.key)`,
    `Read(/${CWD}/**/*.p12)`,
    `Read(/${CWD}/**/*.pfx)`,
    `Read(/${CWD}/**/id_rsa)`,
    `Read(/${CWD}/**/id_ed25519)`,
    `Read(/${CWD}/**/.npmrc)`,
    `Read(/${CWD}/**/.pypirc)`,
    `Read(/${CWD}/**/credentials)`,
    `Read(/${CWD}/**/*.keyfile)`,
    `Read(/${CWD}/**/*.keyfile.json)`,
].join(',');

// Fine-grained tool permissions for the GENERAL coding agent (editRepo). The
// security-critical difference from ALLOWED_TOOLS: there are ZERO Bash entries.
// With no Bash and no per-language toolchain, "no in-sandbox build" is
// enforceable rather than convention — the agent can only read/edit files in
// the cloned repo, write PR metadata to /tmp, and invoke read-only Skills.
export const GENERAL_ALLOWED_TOOLS = [
    `Read(/${CWD}/**)`,
    `Glob(/${CWD}/**)`,
    `Grep(/${CWD}/**)`,
    `Edit(/${CWD}/**)`,
    `Write(/${CWD}/**)`,
    // PR metadata files live directly in /tmp (also passed via --add-dir).
    `Write(//tmp/**)`,
    // Invoke host-curated Skills and read their resource files. The dir is
    // outside CWD so it must also be passed via --add-dir (see addDirs).
    'Skill',
    `Read(/${GENERAL_SKILLS_DIR}/**)`,
].join(',');

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
