import express from 'express';
import { once } from 'node:events';
import http, { type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ReadinessResult } from '../services/ReadinessService/ReadinessService';
import { createProbeRouter } from './probeRouter';

const listen = async (app: express.Express) => {
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const { port } = server.address() as AddressInfo;
    return {
        server,
        baseUrl: `http://127.0.0.1:${port}`,
    };
};

const close = async (server: Server) =>
    new Promise<void>((resolve, reject) => {
        server.close((error) => {
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        });
    });

const get = (url: string) =>
    new Promise<{ body: string; statusCode: number | undefined }>(
        (resolve, reject) => {
            const request = http.get(url, (response) => {
                let body = '';
                response.on('data', (chunk) => {
                    body += chunk;
                });
                response.on('end', () => {
                    resolve({ body, statusCode: response.statusCode });
                });
            });
            request.on('error', reject);
        },
    );

describe('probeRouter', () => {
    it('serves livez before downstream middleware can touch the database', async () => {
        const app = express();
        const getReadiness = vi.fn(
            async (): Promise<ReadinessResult> => ({ status: 'ready' }),
        );
        const databaseTouch = vi.fn();
        app.use('/api/v1', createProbeRouter({ getReadiness }));
        app.use((_req, res) => {
            databaseTouch();
            res.status(500).end();
        });
        const { server, baseUrl } = await listen(app);

        try {
            const response = await get(`${baseUrl}/api/v1/livez`);
            expect(JSON.parse(response.body)).toEqual({ status: 'ok' });
            expect(response.statusCode).toBe(200);
            expect(databaseTouch).not.toHaveBeenCalled();
            expect(getReadiness).not.toHaveBeenCalled();
        } finally {
            await close(server);
        }
    });

    it('maps not-ready verdicts to 503 responses', async () => {
        const app = express();
        const getReadiness = vi.fn(
            async (): Promise<ReadinessResult> => ({
                status: 'not_ready',
                reason: 'db_unavailable',
            }),
        );
        app.use('/api/v1', createProbeRouter({ getReadiness }));
        const { server, baseUrl } = await listen(app);

        try {
            const response = await get(`${baseUrl}/api/v1/readyz`);
            expect(JSON.parse(response.body)).toEqual({
                status: 'not_ready',
                reason: 'db_unavailable',
            });
            expect(response.statusCode).toBe(503);
        } finally {
            await close(server);
        }
    });

    it('maps ready verdicts to 200 responses', async () => {
        const app = express();
        const getReadiness = vi.fn(
            async (): Promise<ReadinessResult> => ({
                status: 'ready',
                warnings: ['migration_parked'],
            }),
        );
        app.use('/api/v1', createProbeRouter({ getReadiness }));
        const { server, baseUrl } = await listen(app);

        try {
            const response = await get(`${baseUrl}/api/v1/readyz`);
            expect(JSON.parse(response.body)).toEqual({
                status: 'ready',
                warnings: ['migration_parked'],
            });
            expect(response.statusCode).toBe(200);
        } finally {
            await close(server);
        }
    });
});
