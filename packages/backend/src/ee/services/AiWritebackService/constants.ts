export const TEMPLATE_NAME = 'lightdash-ai-writeback';

// Where the repo is cloned inside the sandbox, and where the agent runs.
export const CWD = '/home/user/repo';

export const PROMPT_PATH = '/tmp/prompt.txt';
export const SYSTEM_PROMPT_PATH = '/tmp/system_prompt.txt';

// Files the agent writes for the host to open a PR from.
export const PR_TITLE_PATH = '/tmp/pr_title.txt';
export const PR_DESCRIPTION_PATH = '/tmp/pr_description.md';

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
