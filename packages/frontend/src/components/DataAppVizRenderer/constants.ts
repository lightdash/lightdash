// Mirrors MinimalApp's SDK-alive fallback: a stale app bundle that never
// announces must not hang an entire dashboard delivery.
export const SCREENSHOT_READY_FALLBACK_MS = 8_000;
