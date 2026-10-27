import {
    UsageHistoryBackfill,
    usageHistoryCompletionKey,
} from './UsageHistoryBackfill';

const storageCalls = vi.hoisted(() => ({
    headObject: vi.fn(),
    putObject: vi.fn(),
    destroy: vi.fn(),
    run: vi.fn(),
}));
vi.mock('../../clients/Aws/S3BaseClient', () => ({
    S3BaseClient: class {
        protected s3 = storageCalls;
    },
}));
vi.mock('./UsageQueryHistoryBackfill', () => ({
    UsageQueryHistoryBackfill: class {
        run = storageCalls.run;
    },
}));

describe('usage history completion signal', () => {
    const org = '00000000-0000-4000-8000-000000000001';
    const storage = {
        bucket: 'history-test',
        region: 'us-east-1',
        endpoint: 'http://localhost:9000',
    };
    const history = {
        getQueryJsonLines: vi.fn(),
        getAiUsageJsonLines: vi.fn(),
        getActivityJsonLines: vi.fn(),
    };
    const importer = () => new UsageHistoryBackfill(storage);
    beforeEach(() => {
        vi.clearAllMocks();
        storageCalls.headObject.mockResolvedValue({});
        storageCalls.putObject.mockResolvedValue({});
        storageCalls.run.mockReset().mockResolvedValue(undefined);
    });

    it('uses one org-scoped HEAD with no history reads', async () => {
        await expect(importer().isComplete(org)).resolves.toBe(true);
        expect(storageCalls.headObject).toHaveBeenCalledExactlyOnceWith(
            { Bucket: storage.bucket, Key: usageHistoryCompletionKey(org) },
            expect.objectContaining({ abortSignal: expect.any(AbortSignal) }),
        );
        expect(history.getQueryJsonLines).not.toHaveBeenCalled();
        expect(history.getAiUsageJsonLines).not.toHaveBeenCalled();
        expect(history.getActivityJsonLines).not.toHaveBeenCalled();
        expect(storageCalls.destroy).toHaveBeenCalledOnce();
    });
    it('treats only a missing object as incomplete', async () => {
        storageCalls.headObject.mockRejectedValue({
            $metadata: { httpStatusCode: 404 },
        });
        await expect(importer().isComplete(org)).resolves.toBe(false);
    });
    it.each([403, 500, undefined])(
        'does not expose storage details or infer coverage from error %s',
        async (httpStatusCode) => {
            storageCalls.headObject.mockRejectedValue({
                message: 'private provider detail',
                $metadata: { httpStatusCode },
            });
            await expect(importer().isComplete(org)).rejects.toThrow(
                'Unable to check analytics backfill status',
            );
        },
    );
    it('rejects unsafe organization paths before storage access', async () => {
        await expect(importer().isComplete('../other-org')).rejects.toThrow(
            'Invalid organization',
        );
        await expect(importer().run('../other-org', history)).rejects.toThrow(
            'Invalid organization',
        );
        expect(storageCalls.headObject).not.toHaveBeenCalled();
        expect(storageCalls.putObject).not.toHaveBeenCalled();
    });
    it('writes one marker only after all three sources finish, even with no history', async () => {
        await expect(importer().run(org, history)).resolves.toBeUndefined();
        expect(storageCalls.run).toHaveBeenCalledTimes(3);
        expect(storageCalls.putObject).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                Bucket: storage.bucket,
                Key: usageHistoryCompletionKey(org),
            }),
            expect.anything(),
        );
        expect(
            storageCalls.putObject.mock.invocationCallOrder[0],
        ).toBeGreaterThan(storageCalls.run.mock.invocationCallOrder[2]);
    });
    it('does not mark partial completion and can retry all sources', async () => {
        storageCalls.run
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error('source failed'));
        await expect(importer().run(org, history)).rejects.toThrow(
            'source failed',
        );
        expect(storageCalls.putObject).not.toHaveBeenCalled();
        await importer().run(org, history);
        expect(storageCalls.putObject).toHaveBeenCalledOnce();
    });
    it('fails the job if publishing its completion signal fails', async () => {
        storageCalls.putObject.mockRejectedValue(
            new Error('storage unavailable'),
        );
        await expect(importer().run(org, history)).rejects.toThrow(
            'storage unavailable',
        );
    });
});
