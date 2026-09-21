import { S3Client } from '@aws-sdk/client-s3';
import express from 'express';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import {
    Agent,
    createServer,
    get,
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

const APP_UUID = 'd15384cb-8326-433a-a9e9-6f6bb22718f6';
const SMALL_BODY = 'body { color: green; }';
const PROGRESS_BODY = 'body { color: blue; }';
const FINAL_BODY = 'body { color: purple; }';
const TRANSFER_TIMEOUT_MS = 60_000;
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
    let checksumBody: string;
    let cancelOnStorageHeaders: boolean;
    let previewResponse: express.Response;
    const downloads: IncomingMessage[] = [];

    const download = async (url: string, onData?: () => void) =>
        new Promise<{ status: number | undefined; body: string }>(
            (resolve, reject) => {
                get(url, { agent: false }, (res) => {
                    downloads.push(res);
                    let body = '';
                    res.on('data', (chunk) => {
                        body += chunk.toString();
                        onData?.();
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
        checksumBody = SMALL_BODY;
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
            storage.emit('preview-request');
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
                        checksum(checksumBody),
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
        );
        baseUrl = `http://127.0.0.1:${(preview.address() as AddressInfo).port}/${APP_UUID}/versions/1/t/${token}/`;
    });

    afterEach(async () => {
        vi.useRealTimers();
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

    const useFakeTransferClock = () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        vi.spyOn(AbortSignal, 'timeout').mockImplementation((delay) => {
            const controller = new AbortController();
            setTimeout(() => controller.abort(), delay);
            return controller.signal;
        });
    };

    const trackDownloadProgress = () => {
        let chunks = 0;
        const waiters: { count: number; resolve: () => void }[] = [];

        return {
            onData: () => {
                chunks += 1;
                waiters
                    .filter(({ count }) => chunks >= count)
                    .forEach(({ resolve }) => resolve());
            },
            waitForChunk: (count: number) => {
                if (chunks >= count) return Promise.resolve();
                return new Promise<void>((resolve) => {
                    waiters.push({ count, resolve });
                });
            },
        };
    };

    const waitForClose = (stream: {
        once: (event: 'close', listener: () => void) => unknown;
    }) =>
        new Promise<void>((resolve) => {
            stream.once('close', resolve);
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

        it('renews the timeout on progress, then frees a stalled checksum-wrapped download', async () => {
            useFakeTransferClock();
            const progress = trackDownloadProgress();
            const responsePromise = new Promise<IncomingMessage>(
                (resolve, reject) => {
                    get(`${baseUrl}${route}`, { agent: false }, (response) => {
                        downloads.push(response);
                        response.on('data', progress.onData);
                        response.on('error', () => {});
                        resolve(response);
                    }).on('error', reject);
                },
            );
            const response = await responsePromise;
            await progress.waitForChunk(1);

            await vi.advanceTimersByTimeAsync(TRANSFER_TIMEOUT_MS - 1);
            const secondChunk = progress.waitForChunk(2);
            storageResponse!.write(PROGRESS_BODY);
            await secondChunk;

            await vi.advanceTimersByTimeAsync(TRANSFER_TIMEOUT_MS - 1);
            expect(response.destroyed).toBe(false);
            expect(storageClosed).toBe(false);

            const responseClosed = waitForClose(response);
            const storageClose = waitForClose(storageResponse!);
            await vi.advanceTimersByTimeAsync(1);
            await Promise.all([responseClosed, storageClose]);

            expect(response.destroyed).toBe(true);
            expect(storageClosed).toBe(true);
            expect(Logger.warn).toHaveBeenCalledWith(
                'App bundle transfer timed out',
            );
            await expectNextDownload();
            expect(vi.getTimerCount()).toBe(0);
        });

        it('allows a checksum-wrapped download to keep progressing for longer than the timeout', async () => {
            useFakeTransferClock();
            checksumBody = SMALL_BODY + PROGRESS_BODY + FINAL_BODY;
            const progress = trackDownloadProgress();
            const resultPromise = download(
                `${baseUrl}${route}`,
                progress.onData,
            );
            await progress.waitForChunk(1);

            await vi.advanceTimersByTimeAsync(TRANSFER_TIMEOUT_MS - 1);
            const secondChunk = progress.waitForChunk(2);
            storageResponse!.write(PROGRESS_BODY);
            await secondChunk;

            await vi.advanceTimersByTimeAsync(TRANSFER_TIMEOUT_MS - 1);
            const thirdChunk = progress.waitForChunk(3);
            storageResponse!.end(FINAL_BODY);
            await thirdChunk;

            await expect(resultPromise).resolves.toEqual({
                status: 200,
                body: checksumBody,
            });
            expect(Logger.warn).not.toHaveBeenCalled();
            await expectNextDownload();
            expect(storageConnections).toBe(1);
            expect(vi.getTimerCount()).toBe(0);
        });

        it('times out while waiting for initial storage headers', async () => {
            useFakeTransferClock();
            sendHeaders = false;
            const storageRequest = once(storage, 'preview-request');
            const resultPromise = download(`${baseUrl}${route}`);
            await storageRequest;
            const storageClose = waitForClose(storageResponse!);

            await vi.advanceTimersByTimeAsync(TRANSFER_TIMEOUT_MS);

            await expect(resultPromise).resolves.toEqual({
                status: 504,
                body: JSON.stringify({
                    status: 'error',
                    error: { message: 'App bundle transfer timed out' },
                }),
            });
            await storageClose;
            expect(storageClosed).toBe(true);
            expect(Logger.warn).toHaveBeenCalledWith(
                'App bundle transfer timed out',
            );
            sendHeaders = true;
            await expectNextDownload();
            expect(vi.getTimerCount()).toBe(0);
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
