import type { AnalyticsProcessingStats } from '@lightdash/common';
import type { UsageProcessingModel } from '../../models/UsageProcessingModel';
import { UsageProcessingRun } from './UsageProcessingRun';
import type { UserActivitySummary } from './UsageUserActivityBuilder';

vi.mock('../../logging/logger', () => ({
    default: { warn: vi.fn() },
}));

const users = (
    overrides: Partial<UserActivitySummary> = {},
): UserActivitySummary => ({
    published: 0,
    unchanged: 0,
    skipped: 0,
    failed: 0,
    deferred: 0,
    limitReached: false,
    ...overrides,
});

const fixture = () => {
    const model = {
        start: vi
            .fn<UsageProcessingModel['start']>()
            .mockResolvedValue(undefined),
        finish: vi
            .fn<UsageProcessingModel['finish']>()
            .mockResolvedValue(undefined),
    };
    const run = new UsageProcessingRun(model, 'run-uuid');
    return { model, run };
};

const completedStages = (run: UsageProcessingRun, org = 'org-a') => {
    run.compactionFinished();
    run.dimensionsFinished(org, { refreshed: 1, failed: 0 });
    run.usersFinished(org, users(), true);
};

test('records an organization independently from another organization with failures', async () => {
    const { model, run } = fixture();
    await run.start(['org-a', 'org-b']);
    Object.assign(run.stats('org-a'), {
        partitionsDiscovered: 1,
        partitionsCompacted: 1,
        rawObjectsDeleted: 3,
    });
    Object.assign(run.stats('org-b'), {
        partitionsDiscovered: 2,
        partitionsCompacted: 1,
        partitionsFailed: 1,
    });
    run.compactionFinished();
    for (const org of ['org-a', 'org-b']) {
        run.dimensionsFinished(org, { refreshed: 1, failed: 0 });
        run.usersFinished(org, users(), true);
    }
    await run.finish();
    expect(model.finish).toHaveBeenCalledTimes(2);
    expect(model.finish).toHaveBeenCalledWith({
        organizationUuid: 'org-a',
        runUuid: 'run-uuid',
        status: 'success',
        finishedAt: expect.any(Date),
        stats: expect.objectContaining({
            partitionsDiscovered: 1,
            partitionsCompacted: 1,
            partitionsFailed: 0,
            rawObjectsDeleted: 3,
        }),
    });
    expect(model.finish).toHaveBeenCalledWith(
        expect.objectContaining({
            organizationUuid: 'org-b',
            status: 'partial',
        }),
    );
});

test.each(['dimensions', 'users'] as const)(
    'compaction success does not hide %s failures',
    async (stage) => {
        const { model, run } = fixture();
        await run.start(['org-a']);
        Object.assign(run.stats('org-a'), {
            partitionsDiscovered: 1,
            partitionsCompacted: 1,
        });
        run.compactionFinished();
        run.dimensionsFinished('org-a', {
            refreshed: stage === 'dimensions' ? 0 : 1,
            failed: stage === 'dimensions' ? 1 : 0,
        });
        run.usersFinished(
            'org-a',
            users({ failed: stage === 'users' ? 1 : 0 }),
            true,
        );
        await run.finish();
        expect(model.finish).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'partial' }),
        );
    },
);

test('records a fatal interruption before any completed work as failed', async () => {
    const { model, run } = fixture();
    await run.start(['org-a']);
    await run.finish();
    expect(model.finish).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed' }),
    );
});

test('a completed no-op run is successful', async () => {
    const { model, run } = fixture();
    await run.start(['org-a']);
    run.compactionFinished();
    run.dimensionsFinished('org-a', { refreshed: 0, failed: 0 });
    run.usersFinished('org-a', users(), true);
    await run.finish();
    expect(model.finish).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'success' }),
    );
});

test('empty compaction does not count as progress when later stages all fail', async () => {
    const { model, run } = fixture();
    await run.start(['org-a']);
    run.compactionFinished();
    run.dimensionsFinished('org-a', { refreshed: 0, failed: 1 });
    run.usersFinished('org-a', users(), false);
    await run.finish();
    expect(model.finish).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed' }),
    );
});

test.each([
    { partitionsDiscovered: 2, partitionsCompacted: 1, limitReached: true },
    { partitionsDiscovered: 1 },
] satisfies Partial<AnalyticsProcessingStats>[])(
    'keeps capped or unknown-stream raw work partial: %j',
    async (stats) => {
        const { model, run } = fixture();
        await run.start(['org-a']);
        Object.assign(run.stats('org-a'), stats);
        completedStages(run);
        await run.finish();
        expect(model.finish).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'partial' }),
        );
    },
);

test.each([
    { deferred: 1 },
    { limitReached: true },
] satisfies Partial<UserActivitySummary>[])(
    'keeps deferred or capped People summaries partial: %j',
    async (pending) => {
        const { model, run } = fixture();
        await run.start(['org-a']);
        run.compactionFinished();
        run.dimensionsFinished('org-a', { refreshed: 1, failed: 0 });
        run.usersFinished('org-a', users(pending), true);
        await run.finish();
        expect(model.finish).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'partial' }),
        );
    },
);

test('an interrupted People stage cannot advance the successful refresh', async () => {
    const { model, run } = fixture();
    await run.start(['org-a']);
    run.compactionFinished();
    run.dimensionsFinished('org-a', { refreshed: 1, failed: 0 });
    run.usersFinished('org-a', users({ published: 1 }), false);
    await run.finish();
    expect(model.finish).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'partial' }),
    );
});

test('a status-start write failure does not prevent processing', async () => {
    const { model, run } = fixture();
    model.start.mockRejectedValueOnce(new Error('Database unavailable'));
    await expect(run.start(['org-a'])).resolves.toBeUndefined();
    completedStages(run);
    await expect(run.finish()).resolves.toBeUndefined();
    expect(model.finish).not.toHaveBeenCalled();
});

test('a result write failure does not stop recording the next organization', async () => {
    const { model, run } = fixture();
    model.finish.mockRejectedValueOnce(new Error('Database unavailable'));
    await run.start(['org-a', 'org-b']);
    completedStages(run, 'org-a');
    completedStages(run, 'org-b');
    await expect(run.finish()).resolves.toBeUndefined();
    expect(model.finish).toHaveBeenCalledTimes(2);
    expect(model.finish).toHaveBeenLastCalledWith(
        expect.objectContaining({
            organizationUuid: 'org-b',
            status: 'success',
        }),
    );
});

test('does not write status when persistence is unavailable or there are no organizations', async () => {
    const noModel = new UsageProcessingRun(null, 'run-uuid');
    await noModel.start(['org-a']);
    completedStages(noModel);
    await expect(noModel.finish()).resolves.toBeUndefined();
    const { model, run } = fixture();
    await run.start([]);
    await run.finish();
    expect(model.start).not.toHaveBeenCalled();
    expect(model.finish).not.toHaveBeenCalled();
});
