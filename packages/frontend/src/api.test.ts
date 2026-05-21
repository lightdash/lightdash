import { JWT_HEADER_NAME } from '@lightdash/common';
import nock from 'nock';
import { describe, expect, it } from 'vitest';
import {
    BASE_API_URL,
    lightdashApi,
    lightdashApiStream,
    SERVER_ERROR_MARKER,
    stampServerError,
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

// These tests pin down the contract that the React Query retry layer in
// `providers/ReactQuery/queryTransientRetry.ts` depends on:
//   1. The marker is present after stamping.
//   2. The marker is enumerable so shallow copies (spread / Object.assign)
//      preserve retry eligibility when callers wrap an error with extra
//      context.
//   3. The marker is invisible to `JSON.stringify`, `Object.keys`, and
//      `for…in` so it doesn't leak into `networkHistory`, Sentry payloads,
//      logs, or any other downstream consumer that doesn't explicitly look
//      for the Symbol.
//   4. `stampServerError` returns the same object reference so the
//      `throw stampServerError(err)` call pattern preserves the original
//      error identity.
//   5. Stamping is idempotent — calling twice with the same marker is a
//      no-op and never throws.
describe('stampServerError', () => {
    it('returns the same object reference', () => {
        const error = { status: 'error' as const, error: { foo: 'bar' } };
        const result = stampServerError(error);
        expect(result).toBe(error);
    });

    it('stamps the SERVER_ERROR_MARKER on the object', () => {
        const error = { status: 'error' as const };
        stampServerError(error);
        expect(SERVER_ERROR_MARKER in error).toBe(true);
    });

    it('makes the marker enumerable so spread copies preserve it', () => {
        const error = { status: 'error' as const };
        stampServerError(error);
        const descriptor = Object.getOwnPropertyDescriptor(
            error,
            SERVER_ERROR_MARKER,
        );
        expect(descriptor?.enumerable).toBe(true);
    });

    it('survives spread copy', () => {
        const original = stampServerError({ status: 'error' as const });
        const copy = { ...original };
        expect(SERVER_ERROR_MARKER in copy).toBe(true);
    });

    it('survives Object.assign', () => {
        const original = stampServerError({ status: 'error' as const });
        const copy = Object.assign({}, original);
        expect(SERVER_ERROR_MARKER in copy).toBe(true);
    });

    it('survives wrapping with extra context via spread', () => {
        const original = stampServerError({ status: 'error' as const });
        const wrapped = { ...original, requestId: 'abc-123' };
        expect(SERVER_ERROR_MARKER in wrapped).toBe(true);
    });

    it('is invisible to JSON.stringify', () => {
        const error = stampServerError({
            status: 'error' as const,
            error: { name: 'NetworkError', statusCode: 500 },
        });
        const serialized = JSON.stringify(error);
        expect(serialized).toBe(
            '{"status":"error","error":{"name":"NetworkError","statusCode":500}}',
        );
        expect(serialized).not.toContain('serverError');
    });

    it('is invisible to Object.keys', () => {
        const error = stampServerError({
            status: 'error' as const,
            error: { name: 'NetworkError' },
        });
        expect(Object.keys(error)).toEqual(['status', 'error']);
    });

    it('is invisible to for…in', () => {
        const error = stampServerError({
            status: 'error' as const,
            error: { name: 'NetworkError' },
        });
        const keys: string[] = [];
        // eslint-disable-next-line no-restricted-syntax, guard-for-in
        for (const key in error) {
            keys.push(key);
        }
        expect(keys).toEqual(['status', 'error']);
    });

    it('is idempotent — stamping twice does not throw', () => {
        const error = { status: 'error' as const };
        stampServerError(error);
        expect(() => stampServerError(error)).not.toThrow();
        expect(SERVER_ERROR_MARKER in error).toBe(true);
    });
});
