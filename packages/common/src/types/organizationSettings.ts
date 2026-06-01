/**
 * Per-organization settings migrated from instance-wide env vars. Surfaced in
 * the Pro admin panel and stored in the `organization_settings` table. Starts
 * with the OIDC account-linking toggles; designed to grow as more settings
 * move org-level.
 *
 * Each value is tri-state: `null` means "not set — inherit the instance/env
 * default", while an explicit `true`/`false` overrides the env. The fallback
 * to the env default is resolved in the auth layer, not here.
 */
export type OrganizationSettings = {
    /**
     * Auto-link a new OIDC identity to an existing user who already has a
     * different OIDC identity with the same email (overrides
     * `AUTH_ENABLE_OIDC_LINKING`; `null` inherits it).
     */
    oidcLinkingEnabled: boolean | null;
    /**
     * Auto-link an OIDC identity to an existing user matched by verified
     * primary email, regardless of how they signed up (overrides
     * `AUTH_ENABLE_OIDC_TO_EMAIL_LINKING`; `null` inherits it).
     */
    oidcToEmailLinkingEnabled: boolean | null;
    /**
     * Per-org consent for the Lightdash support team to impersonate users in
     * the org while helping with a support request. Unlike the OIDC toggles
     * this has no instance/env default — it's opt-in only, so `null` (or no
     * stored row) resolves to `false`.
     */
    supportImpersonationEnabled: boolean | null;
    /**
     * Base lifetime (seconds) of this org's scheduled-delivery download links —
     * the default every channel inherits. Overrides the instance-wide
     * `PERSISTENT_DOWNLOAD_URL_EXPIRATION_SECONDS` env; `null` inherits it. This
     * field is always resolved to an effective number in API responses (it
     * falls back to the env default), so the frontend can display it directly.
     * A value over {@link S3_PRESIGNED_URL_MAX_EXPIRATION_SECONDS} transparently
     * switches that delivery to the persistent-download-URL system (the only
     * way a link can outlive AWS's 7-day presigned ceiling).
     */
    scheduledDeliveryExpirationSeconds: number | null;
    /**
     * Per-channel override (seconds) of {@link scheduledDeliveryExpirationSeconds}
     * for email deliveries; `null` inherits the base. Unlike the base, this is
     * surfaced raw (not resolved) so the UI can distinguish "inherit" from an
     * explicit value. Overrides `PERSISTENT_DOWNLOAD_URL_EXPIRATION_SECONDS_EMAIL`.
     */
    scheduledDeliveryExpirationSecondsEmail: number | null;
    /**
     * Per-channel override (seconds) for Slack deliveries; `null` inherits the
     * base. Overrides `PERSISTENT_DOWNLOAD_URL_EXPIRATION_SECONDS_SLACK`.
     */
    scheduledDeliveryExpirationSecondsSlack: number | null;
    /**
     * Per-channel override (seconds) for Microsoft Teams deliveries; `null`
     * inherits the base. Overrides `PERSISTENT_DOWNLOAD_URL_EXPIRATION_SECONDS_MSTEAMS`.
     */
    scheduledDeliveryExpirationSecondsMsTeams: number | null;
    /**
     * Per-channel override (seconds) for Google Chat deliveries; `null` inherits
     * the base. Google Chat has no instance env var, so this is an org-only
     * override (it still falls back to the base / env base).
     */
    scheduledDeliveryExpirationSecondsGoogleChat: number | null;
    /**
     * Max number of rows a query/export may return for this org (overrides the
     * instance-wide `LIGHTDASH_QUERY_MAX_LIMIT`; `null` inherits it). Always
     * resolved to an effective number in API responses so the frontend can
     * display it directly.
     */
    queryMaxLimit: number | null;
    /**
     * Max number of cells (rows × columns) a CSV/Excel export may contain for
     * this org (overrides `LIGHTDASH_CSV_CELLS_LIMIT`; `null` inherits it).
     * Always resolved to an effective number in API responses.
     */
    csvCellsLimit: number | null;
};

/**
 * AWS's hard maximum lifetime of an S3 SigV4 presigned URL — seven days. A
 * requested expiry above this can't be served by a raw presigned link, so the
 * delivery transparently falls back to the persistent-download-URL system.
 */
export const S3_PRESIGNED_URL_MAX_EXPIRATION_SECONDS = 604800;

/**
 * Upper bound for {@link OrganizationSettings.csvCellsLimit} — 50 million cells.
 * Matches the highest value set across Cloud customers today; a sane ceiling
 * that still keeps wide exports feasible without inviting OOM-scale requests.
 */
export const MAX_CSV_CELLS_LIMIT = 50000000; // 50 million

export type UpdateOrganizationSettings = Partial<OrganizationSettings>;

export type ApiOrganizationSettingsResponse = {
    status: 'ok';
    results: OrganizationSettings;
};

/**
 * The instance-wide defaults a stored override falls back to. Each field maps
 * to an env var resolved in `parseConfig`; the backend builds this from
 * `lightdashConfig` (see `getOrganizationSettingsInstanceDefaults`) so the
 * fallback values live in exactly one place.
 */
export type OrganizationSettingsInstanceDefaults = {
    enableOidcLinking: boolean;
    enableOidcToEmailLinking: boolean;
    scheduledDeliveryExpirationSeconds: number;
    queryMaxLimit: number;
    csvCellsLimit: number;
};

/**
 * The single source of truth for resolving a stored (raw) org settings record
 * against the instance defaults: an explicit per-org value wins; a value that's
 * `null`, or simply absent (an unset column / no row at all), falls back to the
 * instance default. Used by the backend for both the API response (so the
 * frontend just displays the effective value) and the login flow, so the two
 * can never drift.
 */
export const resolveEffectiveOrganizationSettings = (
    raw: Partial<OrganizationSettings>,
    instanceDefaults: OrganizationSettingsInstanceDefaults,
): OrganizationSettings => ({
    oidcLinkingEnabled:
        raw.oidcLinkingEnabled ?? instanceDefaults.enableOidcLinking,
    oidcToEmailLinkingEnabled:
        raw.oidcToEmailLinkingEnabled ??
        instanceDefaults.enableOidcToEmailLinking,
    // Opt-in only — no instance default, so an unset value resolves to false.
    supportImpersonationEnabled: raw.supportImpersonationEnabled ?? false,
    // Base is resolved to an effective number (falls back to the env default).
    scheduledDeliveryExpirationSeconds:
        raw.scheduledDeliveryExpirationSeconds ??
        instanceDefaults.scheduledDeliveryExpirationSeconds,
    // Per-channel overrides are surfaced raw (null = inherit base) so the UI
    // can tell "not set" apart from an explicit value; their fallback to the
    // base happens at delivery time, not here.
    scheduledDeliveryExpirationSecondsEmail:
        raw.scheduledDeliveryExpirationSecondsEmail ?? null,
    scheduledDeliveryExpirationSecondsSlack:
        raw.scheduledDeliveryExpirationSecondsSlack ?? null,
    scheduledDeliveryExpirationSecondsMsTeams:
        raw.scheduledDeliveryExpirationSecondsMsTeams ?? null,
    scheduledDeliveryExpirationSecondsGoogleChat:
        raw.scheduledDeliveryExpirationSecondsGoogleChat ?? null,
    // Limits resolve to an effective number (fall back to the env default).
    queryMaxLimit: raw.queryMaxLimit ?? instanceDefaults.queryMaxLimit,
    csvCellsLimit: raw.csvCellsLimit ?? instanceDefaults.csvCellsLimit,
});
