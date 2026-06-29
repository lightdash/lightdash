import { assertUnreachable } from '@lightdash/common';
import { google } from 'googleapis';
import type { DataAppOtelAuthConfig } from '../../../config/parseConfig';

/**
 * Per-execution OTLP export auth for data-app sandbox tracing.
 *
 * This module is the single place provider-specific auth lives — the generic
 * OTLP env construction (`claudeCodeOtelEnv.ts`) and the core tracing service
 * stay free of it. Adding a provider means extending `DataAppOtelAuthConfig`
 * and the switch below; removing GCP means deleting this file and the `gcp`
 * config branch.
 *
 * Headers must be minted fresh at sandbox execute/resume time, not baked in at
 * sandbox creation: GCP access tokens are short-lived and a sandbox can be
 * paused and resumed across separate build executions long after its token
 * would have expired.
 */

// Cloud Trace OTLP ingestion is gated behind the broad cloud-platform scope.
const GCP_OTLP_SCOPES = ['https://www.googleapis.com/auth/cloud-platform'];

/**
 * Mints a fresh GCP access token. Injectable so tests (and the resolver below)
 * don't reach for Application Default Credentials.
 */
export type GcpAccessTokenMinter = () => Promise<string | null | undefined>;

// The GoogleAuth client is memoized so we reuse its credential discovery + token
// cache across builds; `getAccessToken()` still returns a fresh (auto-refreshed)
// token on each call.
let cachedAuth: InstanceType<typeof google.auth.GoogleAuth> | undefined;

const defaultMintGcpAccessToken: GcpAccessTokenMinter = () => {
    if (!cachedAuth) {
        cachedAuth = new google.auth.GoogleAuth({ scopes: GCP_OTLP_SCOPES });
    }
    return cachedAuth.getAccessToken();
};

/**
 * Resolves the OTLP export headers to inject into the sandbox for this build.
 * Returns an empty map for the `none` auth path (unauthenticated collector).
 * Throws if a configured provider cannot mint credentials — callers treat
 * tracing as non-fatal and proceed without it.
 */
export const resolveOtelExportHeaders = async (
    auth: DataAppOtelAuthConfig,
    mintGcpAccessToken: GcpAccessTokenMinter = defaultMintGcpAccessToken,
): Promise<Record<string, string>> => {
    switch (auth.type) {
        case 'none':
            return {};
        case 'gcp': {
            const token = await mintGcpAccessToken();
            if (!token) {
                throw new Error(
                    'GCP OTEL auth: no access token resolved from credentials',
                );
            }
            return {
                Authorization: `Bearer ${token}`,
                ...(auth.quotaProjectId
                    ? { 'X-Goog-User-Project': auth.quotaProjectId }
                    : {}),
            };
        }
        default:
            return assertUnreachable(auth, 'Unknown data-app OTEL auth type');
    }
};
