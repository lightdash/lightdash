import { S3Client } from '@aws-sdk/client-s3';
import express from 'express';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import {
    Agent,
    createServer,
    get,
    request as httpRequest,
    type IncomingMessage,
    type Server,
    type ServerResponse,
} from 'node:http';
import { type AddressInfo } from 'node:net';
import { createS3ClientFromConfig } from '../clients/Aws/S3BaseClient';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import Logger from '../logging/logger';
import { createAppPreviewRouter } from './appPreviewRouter';
import { mintPreviewToken } from './appPreviewToken';

vi.mock('../clients/Aws/S3BaseClient', () => ({
    createS3ClientFromConfig: vi.fn(),
}));
vi.mock('../logging/logger', () => ({
    default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const VIEW_ID = '22222222-2222-4222-8222-222222222222';
const REACH = {
    viewContext: 'standalone' as const,
    isBuilder: false,
    creatorId: 'builder',
    isShared: true,
    isPreviewProject: false,
};
const APP_UUID = 'd15384cb-8326-433a-a9e9-6f6bb22718f6';
const SMALL_BODY = 'body { color: green; }';
const checksum = (body: string) =>
    createHash('sha256').update(body).digest('base64');

describe('preview storage connection lifecycle', () => {
    let storage: Server;
    let preview: Server;
    let client: S3Client;
    let agent: Agent;
    let baseUrl: string;
    let storageResponse: ServerResponse | null;
    let storageClosed: boolean;
    let sendHeaders: boolean;
    let completeDownload: boolean;
    let storageStatus: number;
    let storageRequests: number;
    let storageConnections: number;
    let includeChecksum: boolean;
    let cancelOnStorageHeaders: boolean;
    let previewResponse: express.Response;
    const recordReach = vi.fn();
    const recordLegacy = vi.fn();
    const downloads: IncomingMessage[] = [];

    const download = async (url: string) =>
        new Promise<{ status: number | undefined; body: string }>(
            (resolve, reject) => {
                get(url, { agent: false }, (res) => {
                    downloads.push(res);
                    let body = '';
                    res.on('data', (chunk) => {
                        body += chunk.toString();
                    });
                    res.on('end', () =>
                        resolve({ status: res.statusCode, body }),
                    );
                    res.on('error', reject);
                }).on('error', reject);
            },
        );

    beforeEach(async () => {
        vi.clearAllMocks();
        storageResponse = null;
        storageClosed = false;
        sendHeaders = true;
        completeDownload = false;
        storageStatus = 200;
        storageRequests = 0;
        storageConnections = 0;
        includeChecksum = true;
        cancelOnStorageHeaders = false;
        storage = createServer((req, res) => {
            storageRequests += 1;
            if (
                new URL(req.url!, 'http://localhost').pathname.endsWith(
                    '/small.css',
                )
            ) {
                res.setHeader('x-amz-checksum-sha256', checksum(SMALL_BODY));
                res.end(SMALL_BODY);
                return;
            }
            storageResponse = res;
            res.on('close', () => {
                storageClosed = true;
            });
            if (storageStatus !== 200) {
                res.writeHead(storageStatus, {
                    'Content-Type': 'application/xml',
                });
                res.end('<Error><Code>NoSuchKey</Code></Error>');
                return;
            }
            if (sendHeaders) {
                if (includeChecksum)
                    res.setHeader(
                        'x-amz-checksum-sha256',
                        checksum(SMALL_BODY),
                    );
                res.write(SMALL_BODY);
                if (completeDownload) res.end();
            }
        });
        storage.on('connection', () => {
            storageConnections += 1;
        });
        storage.listen(0, '127.0.0.1');
        await once(storage, 'listening');
        agent = new Agent({ keepAlive: true, maxSockets: 1 });
        client = new S3Client({
            endpoint: `http://127.0.0.1:${(storage.address() as AddressInfo).port}`,
            region: 'us-east-1',
            forcePathStyle: true,
            credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
            maxAttempts: 1,
            requestHandler: { httpAgent: agent },
        });
        client.middlewareStack.add(
            (next) => async (args) => {
                const result = await next(args);
                if (cancelOnStorageHeaders) previewResponse.destroy();
                return result;
            },
            { step: 'initialize', name: 'cancelBeforePipeline' },
        );
        vi.mocked(createS3ClientFromConfig).mockReturnValue(client);
        const app = express();
        app.use((_req, res, next) => {
            previewResponse = res;
            next();
        });
        app.use(
            createAppPreviewRouter(
                {
                    ...lightdashConfigMock.appRuntime,
                    previewOrigin: null,
                    s3: {
                        bucket: 'preview-test',
                        region: 'us-east-1',
                        endpoint: 'http://127.0.0.1',
                        accessKey: 'test',
                        secretKey: 'test',
                    },
                },
                lightdashConfigMock.lightdashSecrets,
                ["'self'"],
                recordLegacy,
                recordReach,
            ),
        );
        preview = app.listen(0, '127.0.0.1');
        await once(preview, 'listening');
        const token = mintPreviewToken(
            lightdashConfigMock.lightdashSecrets,
            APP_UUID,
            1,
            'user',
            'org',
            'project',
            [],
            REACH,
        );
        baseUrl = `http://127.0.0.1:${(preview.address() as AddressInfo).port}/${APP_UUID}/versions/1/t/${token}/`;
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        downloads.splice(0).forEach((res) => res.destroy());
        client.destroy();
        agent.destroy();
        await Promise.all(
            [preview, storage].map(
                (server) =>
                    new Promise<void>((resolve) => {
                        server.closeAllConnections();
                        server.close(() => resolve());
                    }),
            ),
        );
    });

    const expectNextDownload = async () => {
        const result = await download(`${baseUrl}assets/small.css`);
        expect(result).toEqual({ status: 200, body: SMALL_BODY });
        expect(Object.values(agent.requests).flat()).toHaveLength(0);
    };

    const postOutcome = async (body: unknown, url = `${baseUrl}reach`) =>
        new Promise<number>((resolve, reject) => {
            const req = httpRequest(
                url,
                { method: 'POST', headers: { 'Content-Type': 'text/plain' } },
                (res) => {
                    res.resume();
                    res.on('end', () => resolve(res.statusCode!));
                },
            );
            req.on('error', reject);
            req.end(JSON.stringify(body));
        });

    it('records one successful HTML load and preserves the existing view callback', async () => {
        completeDownload = true;
        const response = await download(
            `${baseUrl}?usageViewId=${VIEW_ID}&usageReload=true`,
        );
        expect(response.status).toBe(200);
        expect(recordLegacy).toHaveBeenCalledOnce();
        expect(recordReach).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                userId: 'user',
                properties: expect.objectContaining({
                    ...REACH,
                    viewId: VIEW_ID,
                    outcome: 'served',
                    isReload: true,
                    stage: 'load',
                }),
            }),
        );
    });
    it('records a failed HTML response without inventing a successful view', async () => {
        storageStatus = 404;
        await download(`${baseUrl}?usageViewId=${VIEW_ID}`);
        expect(recordReach).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                properties: expect.objectContaining({ outcome: 'failed' }),
            }),
        );
    });
    it('keeps signed identity authoritative and rejects unsupported outcomes or invalid capabilities', async () => {
        expect(
            await postOutcome({
                viewId: VIEW_ID,
                stage: 'sdk_ready',
                userUuid: 'attacker',
                organizationUuid: 'other',
            }),
        ).toBe(204);
        expect(recordReach).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                userId: 'user',
                properties: expect.objectContaining({
                    organizationId: 'org',
                    projectId: 'project',
                    appUuid: APP_UUID,
                    stage: 'sdk_ready',
                }),
            }),
        );
        expect(await postOutcome({ viewId: VIEW_ID, stage: 'launched' })).toBe(
            400,
        );
        expect(
            await postOutcome({ viewId: 'unbounded-id', stage: 'sdk_ready' }),
        ).toBe(400);
        expect(
            await postOutcome(
                { viewId: VIEW_ID, stage: 'sdk_ready' },
                `${baseUrl.replace(/\/t\/[^/]+/, '/t/invalid')}reach`,
            ),
        ).toBe(401);
    });
    it('keeps legacy capabilities working without new telemetry', async () => {
        const legacy = mintPreviewToken(
            lightdashConfigMock.lightdashSecrets,
            APP_UUID,
            1,
            'user',
            'org',
            'project',
        );
        const url = baseUrl.replace(/\/t\/[^/]+/, `/t/${legacy}`);
        completeDownload = true;
        expect((await download(`${url}?usageViewId=${VIEW_ID}`)).status).toBe(
            200,
        );
        expect(
            await postOutcome(
                { viewId: VIEW_ID, stage: 'sdk_ready' },
                `${url}reach`,
            ),
        ).toBe(204);
        expect(recordReach).not.toHaveBeenCalled();
        expect(recordLegacy).toHaveBeenCalledOnce();
    });
    it('does not fail app loads if the capture callback throws', async () => {
        completeDownload = true;
        recordReach.mockImplementationOnce(() => {
            throw new Error('sink down');
        });
        expect(
            (await download(`${baseUrl}?usageViewId=${VIEW_ID}`)).status,
        ).toBe(200);
        expect(Logger.warn).toHaveBeenCalledWith(
            'Failed to record data app reach',
        );
    });

    describe.each(['', 'assets/chart.js'])('route %j', (route) => {
        it('releases the storage socket when the browser cancels a checksum-wrapped download', async () => {
            const response = await new Promise<IncomingMessage>(
                (resolve, reject) => {
                    get(`${baseUrl}${route}`, { agent: false }, resolve).on(
                        'error',
                        reject,
                    );
                },
            );
            downloads.push(response);
            await once(response, 'data');
            response.destroy();

            await vi.waitFor(() => expect(storageClosed).toBe(true));
            await expectNextDownload();
            expect(Logger.error).not.toHaveBeenCalled();
        });

        it('cancels storage work when the browser disconnects before storage headers arrive', async () => {
            sendHeaders = false;
            const request = get(`${baseUrl}${route}`, { agent: false });
            request.on('error', () => {});
            await vi.waitFor(() => expect(storageRequests).toBe(1));
            request.destroy();

            await vi.waitFor(() => expect(storageClosed).toBe(true));
            await expectNextDownload();
            expect(Logger.error).not.toHaveBeenCalled();
        });

        it('aborts the SDK request when the response is destroyed before pipeline starts', async () => {
            cancelOnStorageHeaders = true;
            const request = get(`${baseUrl}${route}`, { agent: false });
            request.on('error', () => {});

            await vi.waitFor(() => expect(storageClosed).toBe(true));
            cancelOnStorageHeaders = false;
            await expectNextDownload();
            expect(Logger.error).not.toHaveBeenCalled();
        });

        it('preserves the storage connection for reuse after a completed download', async () => {
            completeDownload = true;
            expect(await download(`${baseUrl}${route}`)).toEqual({
                status: 200,
                body: SMALL_BODY,
            });
            await expectNextDownload();
            expect(storageConnections).toBe(1);
        });

        it('terminates the browser response when the storage stream fails', async () => {
            includeChecksum = false;
            const response = await new Promise<IncomingMessage>(
                (resolve, reject) => {
                    get(`${baseUrl}${route}`, { agent: false }, resolve).on(
                        'error',
                        reject,
                    );
                },
            );
            downloads.push(response);
            response.on('error', () => {});
            await once(response, 'data');
            storageResponse!.destroy();

            await vi.waitFor(() => expect(response.destroyed).toBe(true));
            await expectNextDownload();
        });

        it('keeps the existing missing-object response', async () => {
            storageStatus = 404;
            const result = await download(`${baseUrl}${route}`);
            expect(result.status).toBe(404);
            expect(result.body).toBe(
                JSON.stringify({
                    status: 'error',
                    error: { message: 'Not found' },
                }),
            );
            await expectNextDownload();
        });
    });
});
