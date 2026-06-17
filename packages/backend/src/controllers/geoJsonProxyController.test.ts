import { ParameterError } from '@lightdash/common';
import {
    secureFetch,
    SecureFetchError,
} from '../utils/secureFetch/secureFetch';
import { GeoJsonProxyController } from './geoJsonProxyController';

jest.mock('../utils/secureFetch/secureFetch', () => {
    const actual = jest.requireActual('../utils/secureFetch/secureFetch');
    return {
        __esModule: true,
        SecureFetchError: actual.SecureFetchError,
        secureFetch: jest.fn(),
    };
});

const mockedSecureFetch = secureFetch as jest.Mock;

const makeController = (): GeoJsonProxyController => {
    // GeoJsonProxyController does not use the ServiceRepository; pass a minimal stub.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const controller = new GeoJsonProxyController({} as any);
    // setStatus is provided by TSOA's Controller base at runtime; stub it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (controller as any).setStatus = jest.fn();
    return controller;
};

describe('GeoJsonProxyController parity', () => {
    beforeEach(() => jest.clearAllMocks());

    it('rejects non-.json/.geojson/.topojson extensions before fetching', async () => {
        const controller = makeController();
        await expect(
            controller.get('https://example.com/data.txt'),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(mockedSecureFetch).not.toHaveBeenCalled();
    });

    it('rejects non-https URLs before fetching', async () => {
        const controller = makeController();
        await expect(
            controller.get('http://example.com/data.json'),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(mockedSecureFetch).not.toHaveBeenCalled();
    });

    it('translates a blocked_ip SecureFetchError into a ParameterError', async () => {
        mockedSecureFetch.mockRejectedValue(
            new SecureFetchError('blocked_ip', 'blocked'),
        );
        const controller = makeController();
        await expect(
            controller.get('https://internal.example.com/data.json'),
        ).rejects.toBeInstanceOf(ParameterError);
    });

    it('translates a redirect SecureFetchError into a ParameterError', async () => {
        mockedSecureFetch.mockRejectedValue(
            new SecureFetchError('redirect', 'redirect'),
        );
        const controller = makeController();
        await expect(
            controller.get('https://example.com/data.json'),
        ).rejects.toBeInstanceOf(ParameterError);
    });

    it('returns parsed GeoJSON object on the happy path', async () => {
        mockedSecureFetch.mockResolvedValue({
            status: 200,
            contentType: 'application/json',
            bodyText: '{"type":"FeatureCollection","features":[]}',
            truncated: false,
        });
        const controller = makeController();
        const result = await controller.get('https://example.com/data.geojson');
        expect(result).toEqual({
            type: 'FeatureCollection',
            features: [],
        });
        expect(mockedSecureFetch).toHaveBeenCalledWith(
            'https://example.com/data.geojson',
            expect.objectContaining({
                method: 'GET',
                allowedContentTypes: expect.arrayContaining([
                    'application/json',
                ]),
            }),
        );
    });

    it('rejects a JSON array body (not a GeoJSON object)', async () => {
        mockedSecureFetch.mockResolvedValue({
            status: 200,
            contentType: 'application/json',
            bodyText: '[1,2,3]',
            truncated: false,
        });
        const controller = makeController();
        await expect(
            controller.get('https://example.com/data.json'),
        ).rejects.toBeInstanceOf(ParameterError);
    });

    it('rejects invalid JSON bodies', async () => {
        mockedSecureFetch.mockResolvedValue({
            status: 200,
            contentType: 'application/json',
            bodyText: 'not json',
            truncated: false,
        });
        const controller = makeController();
        await expect(
            controller.get('https://example.com/data.json'),
        ).rejects.toBeInstanceOf(ParameterError);
    });
});
