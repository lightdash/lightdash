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
};

export type UpdateOrganizationSettings = Partial<OrganizationSettings>;

export type ApiOrganizationSettingsResponse = {
    status: 'ok';
    results: OrganizationSettings;
};

/**
 * The single source of truth for resolving a stored (raw) org settings record
 * against the instance defaults: an explicit per-org value wins; a value that's
 * `null`, or simply absent (an unset column / no row at all), falls back to the
 * instance default. Used by the backend for both the API response (so the
 * frontend just displays the effective value) and the login flow, so the two
 * can never drift. `instanceDefaults` is structurally satisfied by
 * `lightdashConfig.auth`.
 */
export const resolveEffectiveOrganizationSettings = (
    raw: Partial<OrganizationSettings>,
    instanceDefaults: {
        enableOidcLinking: boolean;
        enableOidcToEmailLinking: boolean;
    },
): OrganizationSettings => ({
    oidcLinkingEnabled:
        raw.oidcLinkingEnabled ?? instanceDefaults.enableOidcLinking,
    oidcToEmailLinkingEnabled:
        raw.oidcToEmailLinkingEnabled ??
        instanceDefaults.enableOidcToEmailLinking,
});
