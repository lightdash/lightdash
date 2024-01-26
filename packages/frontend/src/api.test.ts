import { beforeEach, describe, expect, it, vi } from 'vitest';
import createFetchMock from 'vitest-fetch-mock';
import { lightdashApi } from './api';

const fetchMocker = createFetchMock(vi);

fetchMocker.enableMocks();

describe('api', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        fetchMocker.doMock();
        fetchMocker.mockResponse(async () => ({
            body: JSON.stringify({
                status: 'ok',
                results: 'test',
            }),
        }));
    });

    it('should handle success response', async () => {
        const result = await lightdashApi({
            method: 'GET',
            url: '/test',
            body: null,
            headers: undefined,
        });
        expect(result).toEqual('test');
        expect(fetchMocker).toHaveBeenCalledTimes(1);
        expect(fetchMocker).toHaveBeenCalledWith('/api/v1/test', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Lightdash-Request-Method': 'WEB_APP',
            },
            body: null,
        });
    });

    it('should allow custom headers', async () => {
        await lightdashApi({
            method: 'GET',
            url: '/test',
            body: null,
            headers: {
                'Lightdash-Request-Method': 'TEST',
            },
        });
        expect(fetchMocker).toHaveBeenCalledTimes(1);
        expect(fetchMocker).toHaveBeenCalledWith('/api/v1/test', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Lightdash-Request-Method': 'TEST',
            },
            body: null,
        });
    });
});
