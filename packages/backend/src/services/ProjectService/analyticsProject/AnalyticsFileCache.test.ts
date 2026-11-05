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

    it('buffers overlapping query batches with one different file', async () => {
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
        const activityKeys = Array.from(
            { length: 8 },
            (_, n) => `activity-${n}`,
        );
        const get = (file: string) =>
            cache.get(scope, s3, 'bucket', file, 'v1', 4);
        const peopleQuery = ['users', ...activityKeys.slice(0, 7)].map(get);
        const activityQuery = activityKeys.map(get);
        finish();
        const buffers = await Promise.all([...peopleQuery, ...activityQuery]);
        expect(buffers).toEqual(
            Array.from({ length: 16 }, () => Buffer.from('data')),
        );
        expect(send).toHaveBeenCalledTimes(9);
    });

    it('queues the seventeenth download, deduplicates it and reserves its bytes', async () => {
        const cache = new AnalyticsFileCache(17 * 4);
        let finish!: () => void;
        const waiting = new Promise<void>((resolve) => {
            finish = resolve;
        });
        const send = vi.fn(async () => {
            await waiting;
            return response();
        });
        const s3 = client(send);
        const pending = Array.from({ length: 16 }, (_, n) =>
            cache.get(scope, s3, 'bucket', `${n}`, 'v1', 4),
        );
        const seventeenth = cache.get(scope, s3, 'bucket', 'seventeenth', 'v1', 4);
        const duplicate = cache.get(scope, s3, 'bucket', 'seventeenth', 'v1', 4);
        expect(await cache.get(scope, s3, 'bucket', 'over-budget', 'v1', 4)).toBeUndefined();
        expect(send).toHaveBeenCalledTimes(16);
        finish();
        expect(await Promise.all([...pending, seventeenth, duplicate])).toEqual(
            Array.from({ length: 18 }, () => Buffer.from('data')),
        );
        expect(await seventeenth).toBe(await duplicate);
        expect(send).toHaveBeenCalledTimes(17);
    });

    it('releases queued downloads when an active download fails', async () => {
        const cache = new AnalyticsFileCache();
        let finish!: () => void;
        const waiting = new Promise<void>((resolve) => {
            finish = resolve;
        });
        const send = vi.fn(async (command: { input: { Key: string } }) => {
            if (command.input.Key === '0') throw new Error('Download failed');
            await waiting;
            return response();
        });
        const s3 = client(send);
        const pending = Array.from({ length: 17 }, (_, n) =>
            cache.get(scope, s3, 'bucket', `${n}`, 'v1', 4),
        );
        expect(send).toHaveBeenCalledTimes(16);
        expect(await pending[0]).toBeUndefined();
        expect(send).toHaveBeenCalledTimes(17);
        finish();
        expect(await Promise.all(pending.slice(1))).toEqual(
            Array.from({ length: 16 }, () => Buffer.from('data')),
        );
        expect((await cache.get(scope, s3, 'bucket', 'retry', 'v1', 4))?.toString()).toBe('data');
    });

    it('buffers many overlapping dashboard tiles without concurrency fallbacks', async () => {
        const cache = new AnalyticsFileCache();
        let finish!: () => void;
        const waiting = new Promise<void>((resolve) => {
            finish = resolve;
        });
        let active = 0;
        let peak = 0;
        const send = vi.fn(async () => {
            active += 1;
            peak = Math.max(peak, active);
            await waiting;
            active -= 1;
            return response();
        });
        const s3 = client(send);
        const tiles = Array.from({ length: 6 }, (_, tile) => [
            'shared-dimension',
            ...Array.from({ length: 8 }, (_, file) => `tile-${tile}/file-${file}`),
        ]);
        const pending = tiles.flat().map((file) =>
            cache.get(scope, s3, 'bucket', file, 'v1', 4),
        );
        expect(send).toHaveBeenCalledTimes(16);
        finish();
        expect(await Promise.all(pending)).toEqual(
            Array.from({ length: 54 }, () => Buffer.from('data')),
        );
        expect(peak).toBe(16);
        expect(send).toHaveBeenCalledTimes(49);
    });
});
