import { AuthorizationError, ParameterError } from '@lightdash/common';
import express from 'express';
import fetch, { Response } from 'node-fetch';
import { lightdashConfig } from '../config/lightdashConfig';
import { buildAccount } from '../services/ProjectService/ProjectService.mock';
import type { ServiceRepository } from '../services/ServiceRepository';
import { MapTileController, type CartoTileStyle } from './mapTileController';

vi.mock('../config/lightdashConfig', async () => ({
    lightdashConfig: (await import('../config/lightdashConfig.mock'))
        .lightdashConfigMock,
}));

vi.mock('node-fetch', async (importOriginal) => ({
    ...(await importOriginal<typeof import('node-fetch')>()),
    default: vi.fn(),
}));

// A 1x1 transparent PNG.
const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
    'base64',
);
const account = buildAccount();
const tileResponse = (cacheControl = 'public, max-age=3600') =>
    new Response(png, {
        headers: { 'content-type': 'image/png', 'cache-control': cacheControl },
    });
const response = { setHeader: vi.fn(), send: vi.fn() };
const request = { account, res: response } as unknown as express.Request;
const controller = new MapTileController({} as ServiceRepository);

beforeEach(() => {
    vi.mocked(fetch).mockReset();
    vi.clearAllMocks();
    lightdashConfig.carto.apiKey = 'private-test-key';
    request.account = account;
});

describe('CARTO tile proxy', () => {
    it('requires authentication before requesting a tile', async () => {
        await expect(
            controller.getTile(
                { ...request, account: undefined } as express.Request,
                'light',
                1,
                0,
                0,
            ),
        ).rejects.toThrow(AuthorizationError);
        expect(fetch).not.toHaveBeenCalled();
    });

    it.each([
        ['light', 'light_all'],
        ['dark', 'dark_all'],
        ['voyager', 'rastertiles/voyager'],
    ] as const)(
        'fetches %s from the fixed upstream with a server-only key',
        async (style, path) => {
            vi.mocked(fetch).mockResolvedValue(tileResponse());
            await controller.getTile(request, style, 2, 1, 3);
            const [url, options] = vi.mocked(fetch).mock.calls[0];
            expect(String(url)).toBe(
                `https://basemaps.cartocdn.com/${path}/2/1/3.png?key=private-test-key`,
            );
            expect(options).toMatchObject({
                redirect: 'error',
                timeout: 10000,
                size: 1024 * 1024,
            });
            expect(response.send).toHaveBeenCalledWith(png);
            expect(JSON.stringify(response.setHeader.mock.calls)).not.toContain(
                'private-test-key',
            );
        },
    );

    it('supports authenticated embeds', async () => {
        vi.mocked(fetch).mockResolvedValue(tileResponse());
        const embed = buildAccount({
            accountType: 'jwt',
            userType: 'anonymous',
        });
        await expect(
            controller.getTile(
                { ...request, account: embed } as express.Request,
                'light',
                1,
                0,
                0,
            ),
        ).resolves.toBeUndefined();
    });

    it('still serves tiles without a configured key, including provider watermarks', async () => {
        vi.mocked(fetch).mockResolvedValue(tileResponse());
        lightdashConfig.carto.apiKey = null;
        await expect(
            controller.getTile(request, 'light', 1, 0, 0),
        ).resolves.toBeUndefined();
        expect(String(vi.mocked(fetch).mock.calls[0][0])).toBe(
            'https://basemaps.cartocdn.com/light_all/1/0/0.png',
        );
    });

    it.each([
        ['https://evil.example', 1, 0, 0],
        ['__proto__', 1, 0, 0],
        ['light', -1, 0, 0],
        ['light', 21, 0, 0],
        ['light', 1.5, 0, 0],
        ['light', 1, 2, 0],
        ['light', 1, 0, -1],
    ] as const)(
        'rejects invalid tile parameters (%s, %s, %s, %s)',
        async (style, z, x, y) => {
            await expect(
                controller.getTile(request, style as CartoTileStyle, z, x, y),
            ).rejects.toThrow(ParameterError);
            expect(fetch).not.toHaveBeenCalled();
        },
    );

    it.each([
        ['public, max-age=3600', 3600],
        ['no-store', 0],
    ])(
        'uses upstream freshness for browser caching (%s)',
        async (cacheControl, maxAge) => {
            vi.mocked(fetch).mockResolvedValue(
                tileResponse(cacheControl as string),
            );
            await expect(
                controller.getTile(request, 'light', 1, 0, 0),
            ).resolves.toBeUndefined();
            expect(response.setHeader).toHaveBeenCalledWith(
                'Cache-Control',
                maxAge ? `private, max-age=${maxAge}` : 'no-store',
            );
        },
    );

    it('never exposes upstream error messages', async () => {
        vi.mocked(fetch).mockRejectedValueOnce(
            new Error('https://basemaps.cartocdn.com/?key=private-test-key'),
        );
        await expect(
            controller.getTile(request, 'light', 1, 0, 0),
        ).rejects.toMatchObject({ message: 'Unable to load CARTO map tile' });
    });

    it.each([302, 401, 429, 500])(
        'does not forward an upstream %s body or headers',
        async (status) => {
            vi.mocked(fetch).mockResolvedValue(
                new Response('private-test-key', {
                    status,
                    headers: {
                        location: 'https://example.com/?key=private-test-key',
                    },
                }),
            );
            await expect(
                controller.getTile(request, 'light', 1, 0, 0),
            ).rejects.toThrow('Unable to load CARTO map tile');
        },
    );
});
