import { JWT_HEADER_NAME } from '@lightdash/common';
import nock from 'nock';
import { describe, expect, it } from 'vitest';
import { BASE_API_URL, lightdashApi } from './api';
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
});
