import * as Sentry from '@sentry/node';
import { type ErrorRequestHandler } from 'express';
import sharp from 'sharp';
import { z } from 'zod';
import {
    getRawThreadFileBody,
    keepRawThreadFileBodyPrivate,
} from '../middlewares/rawThreadFileBody';
import {
    isSensitiveThreadFileUpload,
    sensitiveUploadHttpOptions,
} from './sensitiveUploadHttpOptions';

test.each([
    '/api/v1/aiAgents/thread-files',
    '/api/v1/aiAgents/thread-files?filename=notes.txt',
    '/api/v1/aiAgents/thread-files/images',
    '/api/v1/aiAgents/thread-files/images/?filename=chart.png',
    '/base/api/v1/aiAgents/thread-files/images',
    '/API/V1/AIAGENTS/THREAD-FILES/IMAGES',
])('sensitive request body is excluded at %s', (url) => {
    expect(isSensitiveThreadFileUpload(url)).toBe(true);
});

test.each([
    '/api/v1/ordinary',
    '/api/v1/aiAgents/thread-files-other',
    '/api/v1/aiAgents/threads',
    'http://[',
])('unrelated body capture is unchanged at %s', (url) => {
    expect(isSensitiveThreadFileUpload(url)).toBe(false);
});

const eventSchema = z.object({
    request: z.object({ url: z.string(), data: z.unknown().optional() }),
    user: z.object({ id: z.string() }),
    exception: z.object({ values: z.array(z.object({ value: z.string() })) }),
});

test('real incoming HTTP error envelopes exclude image/document bytes but preserve actor metadata and unrelated body capture', async () => {
    const envelopes: string[] = [];
    Sentry.init({
        dsn: 'https://public@sentry.invalid/1',
        enabled: true,
        defaultIntegrations: false,
        integrations: [
            Sentry.httpIntegration({
                spans: false,
                ...sensitiveUploadHttpOptions,
            }),
            Sentry.requestDataIntegration(),
        ],
        transport: (options) =>
            Sentry.createTransport(options, async ({ body }) => {
                if (typeof body !== 'string')
                    throw new Error('Expected a JSON error envelope');
                envelopes.push(body);
                return { statusCode: 200 };
            }),
    });
    const express = (await import('express')).default;
    const { createServer, request } = await import('node:http');
    const app = express();
    app.use(express.raw({ type: () => true }));
    app.use('/api/v1/aiAgents/thread-files', keepRawThreadFileBodyPrivate);
    app.use(express.json({ limit: '1kb' }));
    app.post(
        [
            '/api/v1/aiAgents/thread-files/images',
            '/api/v1/aiAgents/thread-files',
            '/api/v1/ordinary',
        ],
        (req, _res, next) => {
            if (isSensitiveThreadFileUpload(req.originalUrl)) {
                expect(req.body).toBeUndefined();
                expect(Buffer.isBuffer(getRawThreadFileBody(req))).toBe(true);
            }
            Sentry.setUser({ id: 'uploader-test' });
            next(new Error('Synthetic upload storage failure'));
        },
    );
    Sentry.setupExpressErrorHandler(app);
    const errorHandler: ErrorRequestHandler = (_error, _req, res, _next) => {
        res.status(500).end();
    };
    app.use(errorHandler);
    const server = createServer(app);
    try {
        await new Promise<void>((resolve, reject) => {
            server.once('error', reject);
            server.listen(0, '127.0.0.1', resolve);
        });
        const address = server.address();
        if (address === null || typeof address === 'string')
            throw new Error('Expected a loopback TCP listener');
        const send = (
            path: string,
            body: Buffer,
            contentType = 'application/octet-stream',
        ) =>
            new Promise<void>((resolve, reject) => {
                const req = request(
                    new URL(path, `http://127.0.0.1:${address.port}`),
                    {
                        method: 'POST',
                        headers: {
                            'content-type': contentType,
                            'content-length': body.length,
                        },
                    },
                    (res) => {
                        res.resume();
                        res.once('end', () => {
                            if (res.statusCode === 500) resolve();
                            else
                                reject(
                                    new Error(
                                        `Expected the upload handler, received HTTP ${res.statusCode}`,
                                    ),
                                );
                        });
                        res.once('error', reject);
                    },
                );
                req.once('error', reject);
                req.end(body);
            });
        const marker = 'PRIVATE_IMAGE_EXIF_MARKER_';
        const image = await sharp({
            create: { width: 2, height: 2, channels: 3, background: 'red' },
        })
            .withMetadata({
                exif: { IFD0: { ImageDescription: marker.repeat(120) } },
            })
            .png()
            .toBuffer();
        expect(image.length).toBeGreaterThanOrEqual(2048);
        expect(image.includes(Buffer.from(marker))).toBe(true);
        await send(
            '/api/v1/aiAgents/thread-files/images?filename=chart.png',
            image,
        );
        await send(
            '/api/v1/aiAgents/thread-files/images?filename=mislabeled.png',
            image,
            'application/json',
        );
        await send(
            '/api/v1/aiAgents/thread-files?filename=notes.txt',
            Buffer.from('PRIVATE_DOCUMENT_MARKER'),
        );
        await send('/api/v1/ordinary', Buffer.from('ordinary-request-control'));
        expect(await Sentry.flush(2000)).toBe(true);
        const events = envelopes.flatMap((envelope) =>
            envelope.split('\n').flatMap((line) => {
                try {
                    const decoded: unknown = JSON.parse(line);
                    const parsed = eventSchema.safeParse(decoded);
                    return parsed.success ? [parsed.data] : [];
                } catch {
                    return [];
                }
            }),
        );
        expect(events).toHaveLength(4);
        events.forEach((event) => {
            expect(event.exception.values.map(({ value }) => value)).toEqual([
                'Synthetic upload storage failure',
            ]);
        });
        const imageEvents = events.filter(({ request: req }) =>
            new URL(req.url).pathname.endsWith('/images'),
        );
        const documentEvent = events.find(({ request: req }) =>
            new URL(req.url).pathname.endsWith('/thread-files'),
        );
        const controlEvent = events.find(({ request: req }) =>
            new URL(req.url).pathname.endsWith('/ordinary'),
        );
        expect(imageEvents).toHaveLength(2);
        imageEvents.forEach((event) => {
            expect(event.request).not.toHaveProperty('data');
            expect(event.user.id).toBe('uploader-test');
        });
        expect(documentEvent?.request).not.toHaveProperty('data');
        expect(documentEvent?.user.id).toBe('uploader-test');
        expect(controlEvent?.request.data).toEqual(
            Buffer.from('ordinary-request-control').toJSON(),
        );
        const serialized = envelopes.join('\n');
        expect(serialized).not.toContain(marker);
        expect(serialized).not.toContain('PRIVATE_DOCUMENT_MARKER');
        expect(serialized).not.toContain('PNG');
    } finally {
        await new Promise<void>((resolve, reject) => {
            server.close((error) => {
                if (error) reject(error);
                else resolve();
            });
        });
        await Sentry.close(2000);
    }
});
