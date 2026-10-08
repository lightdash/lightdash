import { type S3Client } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { AnalyticsFileCache } from './AnalyticsFileCache';

describe('AnalyticsFileCache', () => {
    const scope = 'https://storage.example/bucket/org_id=a/';
    const key = 'org_id=a/part.parquet';
    const response = (text = 'data', etag = 'v1') => ({
        Body: Readable.from([Buffer.from(text)]),
        ContentLength: text.length,
        ETag: etag,
    });
    const client = (send: ReturnType<typeof vi.fn>) =>
        ({ send }) as unknown as S3Client;

    it('shares pending downloads only for the same org, file and version', async () => {
        const cache = new AnalyticsFileCache();
        const send = vi.fn(async (_command: { input: unknown }) => response());
        const s3 = client(send);
        const [a, b] = await Promise.all([
            cache.get(scope, s3, 'bucket', key, 'v1', 4),
            cache.get(scope, s3, 'bucket', key, 'v1', 4),
        ]);
        expect(a?.toString()).toBe('data');
        expect(a).toBe(b);
        expect(send).toHaveBeenCalledTimes(1);
        expect(send.mock.calls[0][0].input).toMatchObject({
            IfMatch: 'v1',
            Key: key,
        });
        await cache.get(
            'https://storage.example/bucket/org_id=b/',
            s3,
            'bucket',
            key,
            'v1',
            4,
        );
        expect(send).toHaveBeenCalledTimes(2);
        send.mockImplementation(async () => response('next', 'v2'));
        expect(
            (await cache.get(scope, s3, 'bucket', key, 'v2', 4))?.toString(),
        ).toBe('next');
        expect(send).toHaveBeenCalledTimes(3);
    });

    it('evicts old buffers within its byte budget', async () => {
        const cache = new AnalyticsFileCache(4);
        const send = vi.fn(async () => response());
        const s3 = client(send);
        await cache.get(scope, s3, 'bucket', key, 'v1', 4);
        await cache.get(scope, s3, 'bucket', 'other', 'v1', 4);
        await cache.get(scope, s3, 'bucket', key, 'v1', 4);
        expect(send).toHaveBeenCalledTimes(3);
    });

    it('falls back for large, unversioned or unbounded files', async () => {
        const cache = new AnalyticsFileCache();
        const send = vi.fn();
        const s3 = client(send);
        for (const [etag, size] of [
            [undefined, 4],
            ['v1', undefined],
            ['v1', 1024 * 1024 + 1],
            ['v1', -1],
        ] as const) {
            expect(
                // eslint-disable-next-line no-await-in-loop
                await cache.get(scope, s3, 'bucket', key, etag, size),
            ).toBeUndefined();
        }
        expect(send).not.toHaveBeenCalled();
    });

    it.each(['changed', 'short', 'long', 'failed'])(
        'does not retain a %s response and permits retry',
        async (failure) => {
            const cache = new AnalyticsFileCache(4);
            const send = vi.fn(async () => {
                if (failure === 'failed') throw Error('failed');
                return {
                    Body: Readable.from([failure === 'long' ? 'larger' : 'a']),
                    ContentLength: 4,
                    ETag: failure === 'changed' ? 'v2' : 'v1',
                };
            });
            const s3 = client(send);
            expect(
                await cache.get(scope, s3, 'bucket', key, 'v1', 4),
            ).toBeUndefined();
            send.mockImplementation(async () => response());
            expect(
                (
                    await cache.get(scope, s3, 'bucket', key, 'v1', 4)
                )?.toString(),
            ).toBe('data');
        },
    );

    it('limits concurrent downloads globally and does not evict pending entries', async () => {
        const cache = new AnalyticsFileCache();
        let finish!: () => void;
        const waiting = new Promise<void>((resolve) => {
            finish = resolve;
        });
        const send = vi.fn(async () => {
            await waiting;
            return response();
        });
        const s3 = client(send);
        const pending = Array.from({ length: 8 }, (_, n) =>
            cache.get(scope, s3, 'bucket', `${n}`, 'v1', 4),
        );
        expect(
            await cache.get(scope, s3, 'bucket', 'ninth', 'v1', 4),
        ).toBeUndefined();
        expect(send).toHaveBeenCalledTimes(8);
        finish();
        await Promise.all(pending);
    });
});
