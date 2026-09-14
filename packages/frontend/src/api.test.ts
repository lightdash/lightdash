import { JWT_HEADER_NAME } from '@lightdash/common';
import nock from 'nock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    BASE_API_URL,
    lightdashApi,
    lightdashApiStream,
    networkHistory,
} from './api';
import { EMBED_KEY } from './ee/providers/Embed/types';
import {
    clearInMemoryStorage,
    setToInMemoryStorage,
} from './utils/inMemoryStorage';

describe('api', () => {
    beforeEach(() => {
        clearInMemoryStorage();
    });

    it('should handle success response', async () => {
        const scope = nock(BASE_API_URL)
            .matchHeader('Content-Type', 'application/json')
            .matchHeader('Lightdash-Request-Method', 'WEB_APP')
            .get('/api/v1/test')
            .reply(200, {
                status: 'ok',
                results: 'test',
            });

        const result = await lightdashApi({
            method: 'GET',
            url: '/test',
            body: null,
            headers: undefined,
        });

        scope.done();

        expect(result).toEqual('test');
        expect(scope.isDone()).toBe(true);
    });

    it('should allow custom headers', async () => {
        const scope = nock(BASE_API_URL)
            .matchHeader('Content-Type', 'application/json')
            .matchHeader('Lightdash-Request-Method', 'TEST')
            .get('/api/v1/test')
            .reply(200, {
                status: 'ok',
                results: 'another test',
            });

        const result = await lightdashApi({
            method: 'GET',
            url: '/test',
            body: null,
            headers: {
                'Lightdash-Request-Method': 'TEST',
            },
        });

        scope.done();

        expect(scope.isDone()).toBe(true);
        expect(result).toEqual('another test');
    });

    it('prevents duplicate embed token headers', async () => {
        setToInMemoryStorage(EMBED_KEY, { token: 'system token' });
        const scope = nock(BASE_API_URL)
            .matchHeader(
                JWT_HEADER_NAME.toUpperCase(),
                'explicit token, same as system',
            )
            .get('/api/v1/test')
            .reply(200, {
                status: 'ok',
                results: 'token headers',
            });

        const result = await lightdashApi({
            method: 'GET',
            url: '/test',
            body: null,
            headers: {
                [JWT_HEADER_NAME.toUpperCase()]:
                    'explicit token, same as system',
            },
        });

        scope.done();

        expect(scope.isDone()).toBe(true);
        expect(result).toEqual('token headers');

        clearInMemoryStorage();
    });

    it('adds embed token headers to stream requests', async () => {
        setToInMemoryStorage(EMBED_KEY, {
            token: 'system token',
            projectUuid: 'project-uuid',
        });
        const scope = nock(BASE_API_URL)
            .matchHeader(JWT_HEADER_NAME, 'system token')
            .post(
                '/api/v1/projects/project-uuid/aiAgents/agent-uuid/threads/thread-uuid/stream',
            )
            .query({ projectUuid: 'project-uuid' })
            .reply(200, 'stream response');

        const result = await lightdashApiStream({
            method: 'POST',
            url: '/projects/project-uuid/aiAgents/agent-uuid/threads/thread-uuid/stream',
            body: JSON.stringify({}),
            headers: undefined,
        });

        scope.done();

        expect(result.ok).toEqual(true);
        expect(scope.isDone()).toBe(true);

        clearInMemoryStorage();
    });
});

describe('networkHistory redaction', () => {
    beforeEach(() => {
        networkHistory.length = 0;
    });

    it('redacts body and response of sensitive requests on success', async () => {
        const scope = nock(BASE_API_URL)
            .post('/api/v1/login')
            .reply(200, {
                status: 'ok',
                results: { token: 'secret-response' },
            });

        await lightdashApi({
            method: 'POST',
            url: '/login',
            body: JSON.stringify({ email: 'a@b.com', password: 'hunter2' }),
            sensitive: true,
        });

        scope.done();

        expect(networkHistory).toHaveLength(1);
        expect(JSON.stringify(networkHistory)).not.toContain('hunter2');
        expect(JSON.stringify(networkHistory)).not.toContain('secret-response');
        expect(networkHistory[0]).toMatchObject({
            method: 'POST',
            url: '/login',
            status: 200,
            body: '[REDACTED: sensitive request]',
            json: '[REDACTED: sensitive request]',
        });
    });

    it('redacts body and error of sensitive requests on failure', async () => {
        const scope = nock(BASE_API_URL)
            .post('/api/v1/login')
            .reply(401, {
                status: 'error',
                error: {
                    name: 'AuthorizationError',
                    statusCode: 401,
                    message: 'Invalid credentials for hunter2',
                    data: {},
                },
            });

        await expect(
            lightdashApi({
                method: 'POST',
                url: '/login',
                body: JSON.stringify({
                    email: 'a@b.com',
                    password: 'hunter2',
                }),
                sensitive: true,
            }),
        ).rejects.toMatchObject({
            error: { name: 'AuthorizationError' },
        });

        scope.done();

        expect(networkHistory).toHaveLength(1);
        expect(JSON.stringify(networkHistory)).not.toContain('hunter2');
        expect(networkHistory[0]).toMatchObject({
            method: 'POST',
            url: '/login',
            body: '[REDACTED: sensitive request]',
            error: '[REDACTED: sensitive request]',
        });
    });

    it('retains body and response of non-sensitive requests', async () => {
        const scope = nock(BASE_API_URL).post('/api/v1/test').reply(200, {
            status: 'ok',
            results: 'visible',
        });

        await lightdashApi({
            method: 'POST',
            url: '/test',
            body: JSON.stringify({ foo: 'bar' }),
        });

        scope.done();

        expect(networkHistory).toHaveLength(1);
        expect(networkHistory[0]).toMatchObject({
            body: JSON.stringify({ foo: 'bar' }),
            json: JSON.stringify({
                status: 'ok',
                results: 'visible',
            }),
        });
    });
});

describe('network error messages', () => {
    let previousFetch: typeof fetch;

    beforeEach(() => {
        previousFetch = globalThis.fetch;
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        globalThis.fetch = previousFetch;
        vi.restoreAllMocks();
    });

    const healthOk = () =>
        new Response(JSON.stringify({ status: 'ok' }), { status: 200 });

    const request = () =>
        lightdashApi({
            method: 'PATCH',
            url: '/projects/abc',
            body: JSON.stringify({}),
            diagnoseTransportFailures: true,
        });

    it('keeps the generic message and never probes unless the request opts in', async () => {
        globalThis.fetch = vi
            .fn()
            .mockRejectedValueOnce(new TypeError('Failed to fetch'))
            .mockResolvedValueOnce(healthOk());

        await expect(
            lightdashApi({
                method: 'GET',
                url: '/user',
                body: undefined,
            }),
        ).rejects.toMatchObject({
            error: {
                name: 'NetworkError',
                statusCode: 500,
                message:
                    'We are currently unable to reach the Lightdash server. Please try again in a few moments.',
                data: {},
            },
        });
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('says the request was blocked when fetch rejects but the server answers a probe', async () => {
        globalThis.fetch = vi
            .fn()
            .mockRejectedValueOnce(new TypeError('Failed to fetch'))
            .mockResolvedValueOnce(healthOk());

        await expect(request()).rejects.toMatchObject({
            status: 'error',
            error: {
                name: 'NetworkError',
                statusCode: 500,
                message: expect.stringContaining(
                    'Lightdash is reachable, but this request was blocked before it arrived',
                ),
                data: {
                    kind: 'blocked',
                    path: 'http://test.lightdash/api/v1/projects/abc',
                    cause: 'Failed to fetch',
                    probe: { ok: true, status: 200 },
                },
            },
        });
    });

    it('keeps the request out of the toast text', async () => {
        globalThis.fetch = vi
            .fn()
            .mockRejectedValueOnce(new TypeError('Failed to fetch'))
            .mockResolvedValueOnce(healthOk());

        await expect(request()).rejects.toMatchObject({
            error: {
                message: expect.not.stringContaining('/projects/abc'),
            },
        });
    });

    it('falls back to the generic message with no diagnostics inside an embed', async () => {
        setToInMemoryStorage(EMBED_KEY, { token: 'jwt' });
        globalThis.fetch = vi
            .fn()
            .mockRejectedValueOnce(new TypeError('Failed to fetch'))
            .mockResolvedValueOnce(healthOk());

        await expect(request()).rejects.toMatchObject({
            error: {
                name: 'NetworkError',
                message:
                    'We are currently unable to reach the Lightdash server. Please try again in a few moments.',
                data: {},
            },
        });
        clearInMemoryStorage();
    });

    it('treats an error body that is not the API envelope as intercepted', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ message: 'Forbidden' }), {
                status: 403,
                headers: { 'Content-Type': 'application/json' },
            }),
        );

        await expect(request()).rejects.toMatchObject({
            error: {
                name: 'NetworkError',
                message: expect.stringContaining(
                    'with HTTP 403 instead of Lightdash',
                ),
                data: { kind: 'intercepted', responseStatus: 403 },
            },
        });
    });

    it('says the server is unreachable when the probe fails too', async () => {
        globalThis.fetch = vi
            .fn()
            .mockRejectedValue(new TypeError('Failed to fetch'));

        await expect(request()).rejects.toMatchObject({
            error: {
                name: 'NetworkError',
                message: expect.stringContaining(
                    'Lightdash cannot be reached from your network right now',
                ),
                data: { kind: 'unreachable' },
            },
        });
    });

    it('reports the HTTP status when the response is not the API envelope', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(
            new Response('<html>blocked</html>', {
                status: 502,
                headers: { 'Content-Type': 'text/html' },
            }),
        );

        await expect(request()).rejects.toMatchObject({
            error: {
                name: 'NetworkError',
                message: expect.stringContaining(
                    'with HTTP 502 instead of Lightdash',
                ),
                data: { kind: 'intercepted', responseStatus: 502 },
            },
        });
    });

    it('reports a cancelled request', async () => {
        globalThis.fetch = vi
            .fn()
            .mockRejectedValue(new DOMException('Aborted', 'AbortError'));

        await expect(request()).rejects.toMatchObject({
            error: {
                name: 'NetworkError',
                message: expect.stringContaining('was cancelled'),
                data: { kind: 'cancelled' },
            },
        });
    });

    it('reports being offline ahead of any other cause', async () => {
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
        globalThis.fetch = vi
            .fn()
            .mockRejectedValue(new TypeError('Failed to fetch'));

        await expect(request()).rejects.toMatchObject({
            error: {
                name: 'NetworkError',
                message:
                    'You appear to be offline. Check your internet connection and try again.',
                data: { kind: 'offline' },
            },
        });
    });

    it('records the diagnosed error in networkHistory', async () => {
        networkHistory.length = 0;
        globalThis.fetch = vi
            .fn()
            .mockRejectedValueOnce(new TypeError('Failed to fetch'))
            .mockResolvedValueOnce(healthOk());

        await expect(request()).rejects.toBeDefined();

        expect(networkHistory).toHaveLength(1);
        expect(networkHistory[0].error).toContain('"kind":"blocked"');
    });

    it('passes real API errors through untouched', async () => {
        const scope = nock(BASE_API_URL)
            .patch('/api/v1/projects/abc')
            .reply(400, {
                status: 'error',
                error: {
                    name: 'ParameterError',
                    statusCode: 400,
                    message:
                        'SSH tunnel is enabled but no public key has been generated.',
                    data: {},
                },
            });

        await expect(request()).rejects.toMatchObject({
            error: {
                name: 'ParameterError',
                statusCode: 400,
                message:
                    'SSH tunnel is enabled but no public key has been generated.',
            },
        });
        scope.done();
    });

    it('uses the same messages for stream requests', async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(
            new Response('<html>blocked</html>', {
                status: 403,
                headers: { 'Content-Type': 'text/html' },
            }),
        );

        await expect(
            lightdashApiStream({
                method: 'POST',
                url: '/stream',
                body: JSON.stringify({}),
                diagnoseTransportFailures: true,
            }),
        ).rejects.toThrow('with HTTP 403 instead of Lightdash');
    });
});

describe('fetch binding', () => {
    const okResponse = (results: unknown) =>
        new Response(JSON.stringify({ status: 'ok', results }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    let previousFetch: typeof fetch;

    beforeEach(() => {
        previousFetch = globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = previousFetch;
    });

    it('calls the fetch implementation active at request time', async () => {
        const stub = vi.fn().mockResolvedValue(okResponse('late-bound'));
        globalThis.fetch = stub;

        const results = await lightdashApi({
            method: 'GET',
            url: '/test',
            body: null,
        });

        expect(stub).toHaveBeenCalledTimes(1);
        expect(results).toEqual('late-bound');
    });

    it('is not stranded when a host page installs and removes a fetch wrapper', async () => {
        // Regression: an embedding host page monkey-patched window.fetch and,
        // on teardown, restored it while nulling the wrapper's saved
        // original. A fetch reference captured at module evaluation kept
        // pointing at the dead wrapper, so every request threw before
        // dispatch and surfaced as the generic NetworkError.
        const restored = vi.fn().mockResolvedValue(okResponse('recovered'));

        let saved: typeof fetch | null = globalThis.fetch;
        const wrapper: typeof fetch = (...args) => {
            if (typeof saved !== 'function') {
                throw new TypeError('saved is not a function');
            }
            return saved(...args);
        };
        globalThis.fetch = wrapper;
        // host page tears its wrapper down
        saved = null;
        globalThis.fetch = restored;

        const results = await lightdashApi({
            method: 'GET',
            url: '/test',
            body: null,
        });

        expect(restored).toHaveBeenCalledTimes(1);
        expect(results).toEqual('recovered');
    });
});
