import express from 'express';
import { request as httpRequest, type Server } from 'http';
import type { AddressInfo } from 'net';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import { buildCspHeader, createAppPreviewRouter } from './appPreviewRouter';

vi.mock('../logging/logger', () => ({
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('app preview CSP browser image origins', () => {
    it('adds the exact origin only to img-src', () => {
        const csp = buildCspHeader(
            lightdashConfigMock.appRuntime,
            ["'self'"],
            ['https://tiles.example.com'],
        );
        const directives = Object.fromEntries(
            csp.split('; ').map((directive) => {
                const [name, ...sources] = directive.split(' ');
                return [name, sources];
            }),
        );

        expect(directives['img-src']).toContain('https://tiles.example.com');
        expect(directives['connect-src']).not.toContain(
            'https://tiles.example.com',
        );
        expect(directives['script-src']).not.toContain(
            'https://tiles.example.com',
        );
    });
});

describe('app preview version segment', () => {
    const APP_UUID = 'd15384cb-8326-433a-a9e9-6f6bb22718f6';
    const servers: Server[] = [];

    afterEach(async () => {
        await Promise.all(
            servers.splice(0).map(
                (server) =>
                    new Promise<void>((resolve, reject) => {
                        server.close((error) =>
                            error ? reject(error) : resolve(),
                        );
                    }),
            ),
        );
    });

    const getStatus = async (path: string): Promise<number> => {
        const app = express();
        app.use(
            createAppPreviewRouter(
                lightdashConfigMock.appRuntime,
                lightdashConfigMock.lightdashSecrets,
                ["'self'"],
            ),
        );
        const server = app.listen(0);
        servers.push(server);

        return new Promise<number>((resolve, reject) => {
            const req = httpRequest(
                {
                    hostname: '127.0.0.1',
                    port: (server.address() as AddressInfo).port,
                    method: 'GET',
                    path,
                },
                (res) => {
                    res.resume();
                    res.on('end', () => resolve(res.statusCode ?? 0));
                },
            );
            req.on('error', reject);
            req.end();
        });
    };

    // These parse to a valid version number but build a different S3 key than
    // the token authorises, so the document and its assets would disagree.
    it.each(['0002', '2.0', '+2', '%202'])(
        'rejects the non-canonical version %j before the token is read',
        async (version) => {
            await expect(
                getStatus(`/${APP_UUID}/versions/${version}/t/not-a-token/`),
            ).resolves.toBe(400);
        },
    );

    it('lets a canonical version through to the token check', async () => {
        await expect(
            getStatus(`/${APP_UUID}/versions/2/t/not-a-token/`),
        ).resolves.toBe(401);
    });
});
