import fetchMock from 'jest-fetch-mock';
import { lightdashApi } from './api';

describe('api', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        fetchMock.mockResponse(async () => ({
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
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith('/api/v1/test', {
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
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith('/api/v1/test', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Lightdash-Request-Method': 'TEST',
            },
            body: null,
        });
    });
});
