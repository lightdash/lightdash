// Runner-side configuration. The backend's own settings (providers, flags) are
// the operator's; the suite never reads or changes them.

// Not SITE_URL: that is the backend's public URL (links, emails) and may point
// at a host the runner cannot reach, e.g. a tunnel.
export const siteUrl = process.env.E2E_AI_SITE_URL ?? 'http://localhost:3000';

export const backendLogPath = process.env.E2E_AI_BACKEND_LOG || null;

export const optInEnabled = process.env.E2E_AI_OPT_IN === '1';

// Mailpit's base URL when deliveries go to a capture inbox (T8.1).
export const mailpitUrl = process.env.E2E_AI_MAILPIT_URL || null;

// One id per invocation: the runner sets it while loading the config and its
// workers inherit it.
export const runId = process.env.E2E_AI_RUN_ID ?? Date.now().toString(36);
process.env.E2E_AI_RUN_ID = runId;
