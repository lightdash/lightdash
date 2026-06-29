import { ParameterError } from '@lightdash/common';
import {
    secureFetch,
    SecureFetchError,
} from '../utils/secureFetch/secureFetch';
import { GeoJsonProxyController } from './geoJsonProxyController';

vi.mock('../utils/secureFetch/secureFetch', async () => {
    const actual = await vi.importActual<
        typeof import('../utils/secureFetch/secureFetch')
    >('../utils/secureFetch/secureFetch');
    return {
        __esModule: true,
        SecureFetchError: actual.SecureFetchError,
        secureFetch: vi.fn(),
    };
});

const mockedSecureFetch = secureFetch as import('vitest').Mock;

const makeController = (): GeoJsonProxyController => {
    // GeoJsonProxyController does not use the ServiceRepository; pass a minimal stub.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const controller = new GeoJsonProxyController({} as any);
    // setStatus is provided by TSOA's Controller base at runtime; stub it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (controller as any).setStatus = vi.fn();
    return controller;
};

describe('GeoJsonProxyController parity', () => {
    beforeEach(() => vi.clearAllMocks());

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
                // Empty list = no content-type restriction (parity with original).
                allowedContentTypes: [],
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

    it('accepts GeoJSON served with application/octet-stream content-type (parity)', async () => {
        // Real-world GeoJSON sources often serve with generic binary or missing
        // content-types. The original controller accepted any type; parity requires
        // allowedContentTypes: [] so secureFetch never rejects on content-type.
        mockedSecureFetch.mockResolvedValue({
            status: 200,
            contentType: 'application/octet-stream',
            bodyText: '{"type":"FeatureCollection","features":[]}',
            truncated: false,
        });
        const controller = makeController();
        const result = await controller.get('https://example.com/data.geojson');
        expect(result).toEqual({ type: 'FeatureCollection', features: [] });
    });

    it('accepts GeoJSON served with a missing content-type (parity)', async () => {
        mockedSecureFetch.mockResolvedValue({
            status: 200,
            contentType: '',
            bodyText: '{"type":"FeatureCollection","features":[]}',
            truncated: false,
        });
        const controller = makeController();
        const result = await controller.get('https://example.com/data.geojson');
        expect(result).toEqual({ type: 'FeatureCollection', features: [] });
    });

    it('accepts GeoJSON served with application/vnd.geo+json content-type (parity)', async () => {
        mockedSecureFetch.mockResolvedValue({
            status: 200,
            contentType: 'application/vnd.geo+json',
            bodyText: '{"type":"FeatureCollection","features":[]}',
            truncated: false,
        });
        const controller = makeController();
        const result = await controller.get('https://example.com/data.geojson');
        expect(result).toEqual({ type: 'FeatureCollection', features: [] });
    });
});
