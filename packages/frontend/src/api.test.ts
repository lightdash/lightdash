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
