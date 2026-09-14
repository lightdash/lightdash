import { assertUnreachable, getErrorMessage } from '@lightdash/common';

// A response arrived but its body is not the Lightdash API JSON envelope, e.g.
// a proxy block page, a gateway error page, or a load balancer timeout.
export class UnexpectedResponseError extends Error {
    readonly status: number;

    constructor(status: number) {
        super(`Unexpected response with HTTP status ${status}`);
        this.name = 'UnexpectedResponseError';
        this.status = status;
    }
}

export type TransportFailureKind =
    | 'offline'
    | 'blocked'
    | 'unreachable'
    | 'intercepted'
    | 'cancelled';

export type ServerProbe = {
    ok: boolean;
    status: number | null;
    durationMs: number;
};

export type NetworkDiagnostics = {
    kind: TransportFailureKind;
    at: string;
    method: string;
    path: string;
    responseStatus: number | null;
    online: boolean;
    probe: ServerProbe | null;
    cause: string;
    traceId: string | null;
    appVersion: string;
    userAgent: string;
};

const PROBE_TIMEOUT_MS = 4000;

// Path segments that follow these carry a one-time code.
const CODE_BEARING_SEGMENTS = ['password-reset', 'invite-links', 'share'];

// The request as it may be shown to people: no query string, no one-time
// codes, and the host only when the request left the page's own origin.
export const redactRequestPath = (apiPrefix: string, url: string): string => {
    const raw = `${apiPrefix}${url}`;
    const absolute = /^https?:\/\//.test(raw);
    const parsed = new URL(raw, 'http://relative.invalid');
    const segments = parsed.pathname.split('/');
    const masked = segments.map((segment, index) =>
        index > 0 && CODE_BEARING_SEGMENTS.includes(segments[index - 1])
            ? '***'
            : segment,
    );
    return `${absolute ? parsed.origin : ''}${masked.join('/')}`;
};

const isAbortError = (err: unknown): boolean =>
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    err.name === 'AbortError';

const isOnline = (): boolean =>
    typeof navigator === 'undefined' || navigator.onLine !== false;

// A cheap GET to the health endpoint. If it succeeds right after another
// request failed, the failure was specific to that request, not the network.
const probeServer = async (apiPrefix: string): Promise<ServerProbe> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    const started = Date.now();
    try {
        const response = await fetch(
            `${apiPrefix}/health?skipMigrationCheck=true`,
            { method: 'GET', cache: 'no-store', signal: controller.signal },
        );
        return {
            ok: response.ok,
            status: response.status,
            durationMs: Date.now() - started,
        };
    } catch {
        return { ok: false, status: null, durationMs: Date.now() - started };
    } finally {
        clearTimeout(timer);
    }
};

export const diagnoseTransportFailure = async ({
    apiPrefix,
    method,
    url,
    error,
    traceId,
}: {
    apiPrefix: string;
    method: string;
    url: string;
    error: unknown;
    traceId: string | null;
}): Promise<NetworkDiagnostics> => {
    const base = {
        at: new Date().toISOString(),
        method,
        path: redactRequestPath(apiPrefix, url),
        online: isOnline(),
        cause: getErrorMessage(error),
        traceId,
        appVersion: __APP_VERSION__,
        userAgent:
            typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent,
    };

    if (error instanceof UnexpectedResponseError) {
        return {
            ...base,
            kind: 'intercepted',
            responseStatus: error.status,
            probe: null,
        };
    }
    if (isAbortError(error)) {
        return {
            ...base,
            kind: 'cancelled',
            responseStatus: null,
            probe: null,
        };
    }
    if (!base.online) {
        return { ...base, kind: 'offline', responseStatus: null, probe: null };
    }
    const probe = await probeServer(apiPrefix);
    return {
        ...base,
        kind: probe.ok ? 'blocked' : 'unreachable',
        responseStatus: null,
        probe,
    };
};

export const GENERIC_NETWORK_FAILURE_MESSAGE =
    'We are currently unable to reach the Lightdash server. Please try again in a few moments.';

// Names the cause only; the request itself lives in the copied diagnostics.
export const networkFailureMessage = (d: NetworkDiagnostics): string => {
    switch (d.kind) {
        case 'offline':
            return 'You appear to be offline. Check your internet connection and try again.';
        case 'blocked':
            return 'Lightdash is reachable, but this request was blocked before it arrived. A corporate proxy, VPN or security software on your network most likely intercepted it. Try again from another network, or copy the diagnostics for your IT team.';
        case 'unreachable':
            return 'Lightdash cannot be reached from your network right now. Check your connection or VPN and try again.';
        case 'intercepted':
            return `Something between you and Lightdash answered this request with HTTP ${d.responseStatus} instead of Lightdash. A proxy, firewall or load balancer intercepted it. Try again in a few moments, or copy the diagnostics for your IT team.`;
        case 'cancelled':
            return 'The request was cancelled before Lightdash responded.';
        default:
            return assertUnreachable(d.kind, 'Unknown transport failure');
    }
};

const outcomeLabel: Record<TransportFailureKind, string> = {
    offline: 'browser is offline',
    blocked: 'request never reached the server, server is reachable',
    unreachable: 'request never reached the server, server is not reachable',
    intercepted: 'a non-Lightdash response was returned',
    cancelled: 'request was cancelled by the browser',
};

export const formatNetworkDiagnostics = (d: NetworkDiagnostics): string => {
    const probe = d.probe
        ? `${d.probe.ok ? 'yes' : 'no'} (GET /health ${
              d.probe.status ?? 'no response'
          } in ${d.probe.durationMs}ms)`
        : 'not checked';
    return [
        'Lightdash request diagnostics',
        `Time: ${d.at}`,
        `Request: ${d.method} ${d.path}`,
        `Outcome: ${outcomeLabel[d.kind]}`,
        `Response status: ${d.responseStatus ?? 'none'}`,
        `Lightdash reachable: ${probe}`,
        `Browser online: ${d.online ? 'yes' : 'no'}`,
        `Error: ${d.cause}`,
        `Trace ID: ${d.traceId ?? 'n/a'}`,
        `App version: ${d.appVersion}`,
        `Browser: ${d.userAgent}`,
    ].join('\n');
};

export const isNetworkDiagnostics = (
    data: unknown,
): data is NetworkDiagnostics =>
    typeof data === 'object' &&
    data !== null &&
    'kind' in data &&
    typeof data.kind === 'string' &&
    'at' in data &&
    'method' in data &&
    'path' in data;
