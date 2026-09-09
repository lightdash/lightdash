import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    diagnoseTransportFailure,
    formatNetworkDiagnostics,
    isNetworkDiagnostics,
    networkFailureMessage,
    redactRequestPath,
    UnexpectedResponseError,
} from './networkDiagnostics';

const request = {
    apiPrefix: 'http://test.lightdash/api/v1',
    method: 'PATCH',
    url: '/projects/abc',
    traceId: 'trace-1',
};

const healthOk = () =>
    new Response(JSON.stringify({ status: 'ok' }), { status: 200 });

describe('diagnoseTransportFailure', () => {
    let previousFetch: typeof fetch;

    beforeEach(() => {
        previousFetch = globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = previousFetch;
        vi.restoreAllMocks();
    });

    it('reports blocked when fetch rejected but the server answers a probe', async () => {
        const probe = vi.fn().mockResolvedValue(healthOk());
        globalThis.fetch = probe;

        const d = await diagnoseTransportFailure({
            ...request,
            error: new TypeError('Failed to fetch'),
        });

        expect(d.kind).toBe('blocked');
        expect(d.probe).toMatchObject({ ok: true, status: 200 });
        expect(d.cause).toBe('Failed to fetch');
        expect(d.path).toBe('http://test.lightdash/api/v1/projects/abc');
        expect(probe).toHaveBeenCalledTimes(1);
        expect(String(probe.mock.calls[0][0])).toContain('/health');
    });

    it('reports unreachable when the probe fails too', async () => {
        globalThis.fetch = vi
            .fn()
            .mockRejectedValue(new TypeError('Failed to fetch'));

        const d = await diagnoseTransportFailure({
            ...request,
            error: new TypeError('Failed to fetch'),
        });

        expect(d.kind).toBe('unreachable');
        expect(d.probe).toMatchObject({ ok: false, status: null });
    });

    it('reports offline without probing', async () => {
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
        const probe = vi.fn();
        globalThis.fetch = probe;

        const d = await diagnoseTransportFailure({
            ...request,
            error: new TypeError('Failed to fetch'),
        });

        expect(d.kind).toBe('offline');
        expect(d.online).toBe(false);
        expect(probe).not.toHaveBeenCalled();
    });

    it('reports intercepted with the status of the foreign response', async () => {
        const probe = vi.fn();
        globalThis.fetch = probe;

        const d = await diagnoseTransportFailure({
            ...request,
            error: new UnexpectedResponseError(502),
        });

        expect(d.kind).toBe('intercepted');
        expect(d.responseStatus).toBe(502);
        expect(probe).not.toHaveBeenCalled();
    });

    it('reports cancelled for aborted requests', async () => {
        const d = await diagnoseTransportFailure({
            ...request,
            error: new DOMException('Aborted', 'AbortError'),
        });

        expect(d.kind).toBe('cancelled');
    });
});

describe('redactRequestPath', () => {
    it('drops the query string and keeps a relative prefix relative', () => {
        expect(redactRequestPath('/api/v1', '/search?q=secret+term')).toBe(
            '/api/v1/search',
        );
        expect(
            redactRequestPath('http://test.lightdash/api/v1', '/projects/abc'),
        ).toBe('http://test.lightdash/api/v1/projects/abc');
    });

    it('masks one-time codes in the path', () => {
        expect(redactRequestPath('/api/v1', '/password-reset/abc123')).toBe(
            '/api/v1/password-reset/***',
        );
        expect(
            redactRequestPath('/api/v1', '/invite-links/code42/activate'),
        ).toBe('/api/v1/invite-links/***/activate');
        expect(redactRequestPath('/api/v1', '/share/n4n0id')).toBe(
            '/api/v1/share/***',
        );
    });
});

describe('networkFailureMessage', () => {
    it('names the likely culprit per kind without the request', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(healthOk());
        const blocked = await diagnoseTransportFailure({
            ...request,
            error: new TypeError('Failed to fetch'),
        });
        expect(networkFailureMessage(blocked)).toContain(
            'Lightdash is reachable, but this request was blocked',
        );
        expect(networkFailureMessage(blocked)).not.toContain('/projects/abc');

        const intercepted = await diagnoseTransportFailure({
            ...request,
            error: new UnexpectedResponseError(403),
        });
        expect(networkFailureMessage(intercepted)).toContain('HTTP 403');
    });
});

describe('formatNetworkDiagnostics', () => {
    it('produces a pasteable report', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(healthOk());
        const d = await diagnoseTransportFailure({
            ...request,
            error: new TypeError('Failed to fetch'),
        });

        const text = formatNetworkDiagnostics(d);

        expect(text).toContain(
            'Request: PATCH http://test.lightdash/api/v1/projects/abc',
        );
        expect(text).toContain(
            'Outcome: request never reached the server, server is reachable',
        );
        expect(text).toContain('Lightdash reachable: yes (GET /health 200');
        expect(text).toContain('Error: Failed to fetch');
        expect(text).toContain('Trace ID: trace-1');
        expect(isNetworkDiagnostics(d)).toBe(true);
        expect(isNetworkDiagnostics({ message: 'nope' })).toBe(false);
    });
});
