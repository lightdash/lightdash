import { ForbiddenError, type SessionUser } from '@lightdash/common';
import express from 'express';
import { once } from 'node:events';
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { AppGenerateService } from '../services/AppGenerateService/AppGenerateService';
import { chartRegistryAssetRouter } from './chartRegistryAssetRouter';

// The router's own auth wiring is just `allowApiKeyAuthentication` +
// `isAuthenticated` imported from controllers/authentication — those
// middlewares have their own coverage. Replacing them with pass-throughs
// here isolates the router's own logic (query validation, service
// delegation, status/header mapping, error propagation).
vi.mock('../../controllers/authentication', () => ({
    allowApiKeyAuthentication: (
        _req: express.Request,
        _res: express.Response,
        next: express.NextFunction,
    ) => next(),
    isAuthenticated: (
        _req: express.Request,
        _res: express.Response,
        next: express.NextFunction,
    ) => next(),
}));

type AppGenerateServiceStub = Pick<AppGenerateService, 'getRegistryAsset'>;

const fakeUser = { userUuid: 'user-uuid' } as SessionUser;

const requestAsset = async ({
    getRegistryAsset,
    path,
}: {
    getRegistryAsset: AppGenerateServiceStub['getRegistryAsset'];
    path: string;
}): Promise<{
    body: Buffer;
    headers: IncomingHttpHeaders;
    status: number;
}> => {
    const app = express();
    app.use((req, _res, next) => {
        req.user = fakeUser;
        req.services = {
            getAppGenerateService: () =>
                ({ getRegistryAsset }) as unknown as AppGenerateService,
        } as Express.Request['services'];
        next();
    });
    app.use('/api/v1/ee/chart-registry', chartRegistryAssetRouter);
    // Stand-in for the app's real error handler: turns a next(err) into a
    // 500 so the test can assert the error actually propagated instead of
    // being swallowed.
    app.use(
        (
            err: unknown,
            _req: express.Request,
            res: express.Response,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            _next: express.NextFunction,
        ) => {
            res.status(500).json({
                error: err instanceof Error ? err.message : 'unknown error',
            });
        },
    );

    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');

    try {
        return await new Promise((resolve, reject) => {
            const req = httpRequest(
                {
                    hostname: '127.0.0.1',
                    method: 'GET',
                    path: `/api/v1/ee/chart-registry${path}`,
                    port: (server.address() as AddressInfo).port,
                },
                (response) => {
                    const chunks: Buffer[] = [];
                    response.on('data', (chunk: Buffer) => chunks.push(chunk));
                    response.on('end', () =>
                        resolve({
                            body: Buffer.concat(chunks),
                            headers: response.headers,
                            status: response.statusCode ?? 0,
                        }),
                    );
                },
            );
            req.on('error', reject);
            req.end();
        });
    } finally {
        await new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
        });
    }
};

describe('chartRegistryAssetRouter GET /assets', () => {
    it('returns 400 when the path query param is missing', async () => {
        const getRegistryAsset = vi.fn();

        const response = await requestAsset({
            getRegistryAsset,
            path: '/assets',
        });

        expect(response.status).toBe(400);
        expect(getRegistryAsset).not.toHaveBeenCalled();
    });

    it('returns 400 when path is repeated (parses to an array, not a string)', async () => {
        const getRegistryAsset = vi.fn();

        const response = await requestAsset({
            getRegistryAsset,
            path: '/assets?path=a&path=b',
        });

        expect(response.status).toBe(400);
        expect(getRegistryAsset).not.toHaveBeenCalled();
    });

    it('returns 404 when the service reports no asset', async () => {
        const getRegistryAsset = vi.fn().mockResolvedValue(undefined);

        const response = await requestAsset({
            getRegistryAsset,
            path: '/assets?path=sankey%2F1.3.0%2Fthumb.png',
        });

        expect(response.status).toBe(404);
        expect(getRegistryAsset).toHaveBeenCalledWith(
            fakeUser,
            'sankey/1.3.0/thumb.png',
        );
    });

    it('returns 200 with the asset bytes and exact headers', async () => {
        const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
        const getRegistryAsset = vi.fn().mockResolvedValue({
            buffer: pngBuffer,
            contentType: 'image/png',
        });

        const response = await requestAsset({
            getRegistryAsset,
            path: '/assets?path=sankey%2F1.3.0%2Fthumb.png',
        });

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toBe('image/png');
        expect(response.headers['cache-control']).toBe('private, max-age=3600');
        expect(response.body).toEqual(pngBuffer);
    });

    it('propagates a service error to the error handler', async () => {
        const getRegistryAsset = vi
            .fn()
            .mockRejectedValue(new Error('registry unreachable'));

        const response = await requestAsset({
            getRegistryAsset,
            path: '/assets?path=sankey%2F1.3.0%2Fthumb.png',
        });

        expect(response.status).toBe(500);
        expect(JSON.parse(response.body.toString('utf8'))).toEqual({
            error: 'registry unreachable',
        });
    });

    it('propagates a ForbiddenError from the service (flags-off gate) to the error handler', async () => {
        const getRegistryAsset = vi
            .fn()
            .mockRejectedValue(
                new ForbiddenError('The chart type library is not enabled'),
            );

        const response = await requestAsset({
            getRegistryAsset,
            path: '/assets?path=sankey%2F1.3.0%2Fthumb.png',
        });

        expect(JSON.parse(response.body.toString('utf8'))).toEqual({
            error: 'The chart type library is not enabled',
        });
    });
});
