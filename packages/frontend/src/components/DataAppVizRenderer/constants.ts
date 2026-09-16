// Mirrors MinimalApp's SDK-alive fallback: a stale app bundle that never
// announces must not hang an entire dashboard delivery.
export const SCREENSHOT_READY_FALLBACK_MS = 8_000;

// SDKs with a feature manifest send it during bootstrap. A silent bundle after
// this window predates manifests, so it alone may use the readiness fallback.
export const LEGACY_VIZ_MANIFEST_TIMEOUT_MS = 5_000;
