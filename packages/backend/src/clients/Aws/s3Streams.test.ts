import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import http, { type IncomingMessage, type ServerResponse } from 'http';
import { type AddressInfo } from 'net';
import { PassThrough, type Readable } from 'stream';
import { buildS3ClientConfig } from './S3BaseClient';
import { destroyS3Body, pipeS3BodyToResponse } from './s3Streams';
import { ChecksumStreamStandIn } from './s3Streams.testUtils';

describe('destroyS3Body', () => {
    it('destroys the HTTP response behind an SDK checksum wrapper', () => {
        const response = new PassThrough();
        const body = new ChecksumStreamStandIn(response);
        response.write('still streaming');

        destroyS3Body(body);

        expect(body.destroyed).toBe(true);
        expect(response.destroyed).toBe(true);
    });

    it('destroys a plain body', () => {
        const body = new PassThrough();

        destroyS3Body(body);

        expect(body.destroyed).toBe(true);
    });

    it('passes the error to both streams', async () => {
        const response = new PassThrough();
        const body = new ChecksumStreamStandIn(response);
        const errors: unknown[] = [];
        body.on('error', (e) => errors.push(e));
        response.on('error', (e) => errors.push(e));
        const error = new Error('cancelled');

        destroyS3Body(body, error);
        // destroy() emits 'error' on the next tick
        await new Promise((resolve) => {
            setImmediate(resolve);
        });

        expect(errors).toEqual([error, error]);
    });
});

const CHUNK = Buffer.alloc(64 * 1024, 'a');

const listen = async (
    handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<{ server: http.Server; port: number }> => {
    const server = http.createServer(handler);
    await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', resolve);
    });
    return { server, port: (server.address() as AddressInfo).port };
};

const readFirstChunkThenAbort = (port: number) =>
    new Promise<void>((resolve) => {
        const request = http.get({ host: '127.0.0.1', port }, (res) => {
            res.once('data', () => {
                request.destroy();
                resolve();
            });
        });
        request.on('error', () => {});
    });

const get = (port: number) =>
    new Promise<{ status: number; body: string }>((resolve, reject) => {
        http.get({ host: '127.0.0.1', port }, (res) => {
            let body = '';
            res.on('data', (chunk) => {
                body += chunk;
            });
            res.on('end', () => resolve({ status: res.statusCode!, body }));
            res.on('error', reject);
        }).on('error', reject);
    });

describe('pipeS3BodyToResponse', () => {
    const servers: http.Server[] = [];

    afterEach(() => {
        servers.splice(0).forEach((server) => {
            server.closeAllConnections();
            server.close();
        });
    });

    it('releases the S3 socket when the client aborts the download', async () => {
        const fakeS3 = await listen((_req, res) => {
            res.writeHead(200, {
                'content-length': String(CHUNK.length * 400),
            });
            let written = 0;
            const write = () => {
                while (written < 400) {
                    written += 1;
                    if (!res.write(CHUNK)) {
                        res.once('drain', write);
                        return;
                    }
                }
                res.end();
            };
            write();
        });
        servers.push(fakeS3.server);
        const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 1 });
        const s3 = new S3Client({
            ...buildS3ClientConfig({
                region: 'us-east-1',
                endpoint: `http://127.0.0.1:${fakeS3.port}`,
                forcePathStyle: true,
                accessKey: 'key',
                secretKey: 'secret',
            }),
            requestHandler: { httpAgent },
        });
        const getBody = async () =>
            (await s3.send(new GetObjectCommand({ Bucket: 'b', Key: 'k' })))
                .Body as Readable;

        const piped: Promise<void>[] = [];
        const backend = await listen((_req, res) => {
            piped.push(
                getBody().then((body) => pipeS3BodyToResponse(body, res)),
            );
        });
        servers.push(backend.server);

        await readFirstChunkThenAbort(backend.port);
        await Promise.all(piped);

        const next = await Promise.race([
            getBody().then((body) => {
                body.resume();
                return 'served';
            }),
            new Promise((resolve) => {
                setTimeout(() => resolve('pool exhausted'), 2000);
            }),
        ]);
        expect(next).toBe('served');
        httpAgent.destroy();
    });

    it('destroys the HTTP response behind an SDK checksum wrapper on abort', async () => {
        const source = new PassThrough();
        const body = new ChecksumStreamStandIn(source);
        let piped: Promise<void> = Promise.resolve();
        const backend = await listen((_req, res) => {
            piped = pipeS3BodyToResponse(body, res);
            const write = () => {
                while (source.write(CHUNK));
                source.once('drain', write);
            };
            write();
        });
        servers.push(backend.server);

        await readFirstChunkThenAbort(backend.port);
        await expect(piped).resolves.toBeUndefined();
        expect(body.destroyed).toBe(true);
        expect(source.destroyed).toBe(true);
    });

    it('streams the whole body', async () => {
        const backend = await listen((_req, res) => {
            const body = new PassThrough();
            void pipeS3BodyToResponse(body, res);
            body.end('{"a":1}\n{"a":2}\n');
        });
        servers.push(backend.server);

        await expect(get(backend.port)).resolves.toEqual({
            status: 200,
            body: '{"a":1}\n{"a":2}\n',
        });
    });

    it('resets the connection when the body fails', async () => {
        const body = new PassThrough();
        let piped: Promise<void> = Promise.resolve();
        const backend = await listen((_req, res) => {
            piped = pipeS3BodyToResponse(body, res);
            body.write('{"a":1}\n');
            setImmediate(() => body.destroy(new Error('ECONNRESET')));
        });
        servers.push(backend.server);

        await expect(get(backend.port)).rejects.toThrow();
        await expect(piped).resolves.toBeUndefined();
        expect(body.destroyed).toBe(true);
    });
});
