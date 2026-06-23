import { google } from 'googleapis';
import type { ClaudeCodeOtelConfig } from './claudeCodeEnv';

// Least-privilege scope for writing traces. If telemetry.googleapis.com ever
// rejects it, widen to https://www.googleapis.com/auth/cloud-platform (the SA's
// IAM role still bounds what the token can actually do).
const GCP_TRACE_SCOPE = 'https://www.googleapis.com/auth/trace.append';

/**
 * Mints a short-lived GCP access token via Application Default Credentials and
 * returns it as the `OTEL_EXPORTER_OTLP_HEADERS` value for the data-app sandbox.
 * The deployment's identity (e.g. a Workload-Identity service account) must be
 * granted trace-write permission. `X-Goog-User-Project` is derived from ADC
 * unless `gcpProject` overrides it.
 *
 * Only reached in `gcp` auth mode (default is `static`), so non-GCP installs
 * never run any of this.
 */
const mintGcpOtelHeaders = async (
    otel: ClaudeCodeOtelConfig,
): Promise<string> => {
    const auth = new google.auth.GoogleAuth({ scopes: [GCP_TRACE_SCOPE] });
    const client = await auth.getClient();

    const { token } = await client.getAccessToken();
    if (!token) {
        throw new Error('Failed to mint a GCP access token for OTEL export');
    }

    const project = otel.gcpProject ?? (await auth.getProjectId());

    return `Authorization=Bearer ${token},X-Goog-User-Project=${project}`;
};

/**
 * Resolves the `OTEL_EXPORTER_OTLP_HEADERS` value for the data-app sandbox.
 * - `gcp`: mints a short-lived WI token (above).
 * - `static` (default): the configured headers, verbatim.
 * Returns null when telemetry is disabled.
 */
export const resolveDataAppOtelHeaders = async (
    otel: ClaudeCodeOtelConfig,
): Promise<string | null> => {
    if (!otel.enabled) {
        return null;
    }
    if (otel.auth === 'gcp') {
        return mintGcpOtelHeaders(otel);
    }
    return otel.headers;
};
