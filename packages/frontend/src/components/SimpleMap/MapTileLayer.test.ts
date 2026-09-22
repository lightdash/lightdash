import { JWT_HEADER_NAME, MapTileBackground } from '@lightdash/common';
import { act, renderHook, waitFor } from '@testing-library/react';
import L from 'leaflet';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMBED_KEY } from '../../ee/providers/Embed/types';
import { getTileConfig } from '../../hooks/leaflet/useLeafletMapConfig';
import { useTileFallback } from '../../hooks/leaflet/useTileFallback';
import {
    clearInMemoryStorage,
    setToInMemoryStorage,
} from '../../utils/inMemoryStorage';
import { AuthenticatedTileLayer } from './MapTileLayer';

const tilePath = '/map-tiles/light/1/0/0.png';
const coords = Object.assign(L.point(0, 0), { z: 1 });
const createLayer = () => {
    const layer = new AuthenticatedTileLayer(
        '/map-tiles/light/{z}/{x}/{y}.png',
        {},
    );
    return layer;
};

beforeEach(() => {
    clearInMemoryStorage();
    vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
            new Response('png', {
                headers: { 'content-type': 'image/png' },
            }),
        ),
    );
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:tile');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});
afterEach(() => {
    clearInMemoryStorage();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('authenticated map tiles', () => {
    it('uses the embed JWT and project for the proxy, then releases the object URL after rendering', async () => {
        setToInMemoryStorage(EMBED_KEY, {
            token: 'embed-test-token',
            projectUuid: 'embed-project',
        });
        const layer = createLayer();
        const done = vi.fn();
        const image = layer.createTile(coords, done) as HTMLImageElement;
        await waitFor(() => expect(image.src).toBe('blob:tile'));

        expect(fetch).toHaveBeenCalledWith(
            `http://test.lightdash/api/v1${tilePath}?projectUuid=embed-project`,
            expect.objectContaining({
                headers: expect.objectContaining({
                    [JWT_HEADER_NAME]: 'embed-test-token',
                }),
            }),
        );
        image.dispatchEvent(new Event('load'));
        expect(done).toHaveBeenCalledWith(undefined, image);
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:tile');
    });

    it('passes tile failures to Leaflet so provider fallback still works', async () => {
        vi.mocked(fetch).mockResolvedValue(
            new Response(
                JSON.stringify({
                    status: 'error',
                    error: {
                        name: 'UnexpectedServerError',
                        statusCode: 500,
                        message: 'Unable to load CARTO map tile',
                    },
                }),
                { status: 500 },
            ),
        );
        const done = vi.fn();
        const image = createLayer().createTile(coords, done);
        await waitFor(() =>
            expect(done).toHaveBeenCalledWith(expect.any(Error), image),
        );
    });

    it('aborts unloaded tiles without reporting a provider failure', async () => {
        vi.mocked(fetch).mockImplementation(
            (_url, options) =>
                new Promise((_resolve, reject) => {
                    options?.signal?.addEventListener('abort', () =>
                        reject(new DOMException('Aborted', 'AbortError')),
                    );
                }),
        );
        const layer = createLayer();
        const done = vi.fn();
        const image = layer.createTile(coords, done);
        const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
        layer.fire('tileunload', { tile: image });
        expect(signal?.aborted).toBe(true);
        await Promise.resolve();
        expect(done).not.toHaveBeenCalled();
        expect(URL.createObjectURL).not.toHaveBeenCalled();
    });
    it('uses the backend proxy when OpenStreetMap falls back to Voyager', () => {
        const { result } = renderHook(() =>
            useTileFallback(
                getTileConfig(MapTileBackground.OPENSTREETMAP),
                MapTileBackground.OPENSTREETMAP,
            ),
        );

        act(() => {
            for (let i = 0; i < 5; i += 1) {
                result.current.tileLayerEventHandlers.tileerror();
            }
        });

        expect(result.current.activeBackground).toBe(MapTileBackground.VOYAGER);
        expect(result.current.activeTile.url).toBe(
            '/map-tiles/voyager/{z}/{x}/{y}.png',
        );
        expect(result.current.activeTile.isProxied).toBe(true);
    });
});
