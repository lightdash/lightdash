import { type AnalyticsProcessingStats } from '@lightdash/common';
import { randomUUID } from 'node:crypto';
import { UsageProcessingModel } from '../../../models/UsageProcessingModel';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { UsageProcessingStatusTableName } from '../../entities/usageProcessingStatus';
import { down, up } from '../20261030100000_create_usage_processing_status';

let migrated: MigratedDatabase;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
});
afterAll(async () => migrated?.destroy());

const stats = (): AnalyticsProcessingStats => ({
    partitionsDiscovered: 2,
    partitionsCompacted: 2,
    partitionsFailed: 0,
    rawObjectsDeleted: 4,
    dimensionsFailed: 0,
    userPartitionsFailed: 0,
    userPartitionsDeferred: 0,
    limitReached: false,
});
const startedAt = new Date('2026-10-29T00:30:00Z');
const finishedAt = new Date('2026-10-29T00:42:00Z');
const nextStartedAt = new Date('2026-10-30T00:30:00Z');
const nextFinishedAt = new Date('2026-10-30T00:42:00Z');

const fixture = async () => {
    const [org] = await migrated
        .database('organizations')
        .insert({ organization_name: 'Usage processing test' })
        .returning('organization_uuid');
    return {
        model: new UsageProcessingModel(migrated.database),
        organizationUuid: org.organization_uuid,
        runUuid: randomUUID(),
    };
};

test('persists one latest row and preserves the last success after a failed attempt', async () => {
    const { model, organizationUuid, runUuid } = await fixture();
    expect(await model.find(organizationUuid)).toBeNull();
    await model.start([organizationUuid], runUuid, startedAt);
    expect(await model.find(organizationUuid)).toMatchObject({
        status: 'running',
        startedAt: startedAt.toISOString(),
        finishedAt: null,
        lastSuccessfulAt: null,
    });
    await model.finish({
        organizationUuid,
        runUuid,
        status: 'success',
        finishedAt,
        stats: stats(),
    });
    const nextRun = randomUUID();
    await model.start([organizationUuid], nextRun, nextStartedAt);
    await model.finish({
        organizationUuid,
        runUuid: nextRun,
        status: 'failed',
        finishedAt: nextFinishedAt,
        stats: {
            ...stats(),
            partitionsCompacted: 1,
            partitionsFailed: 1,
        },
    });
    expect(
        await new UsageProcessingModel(migrated.database).find(
            organizationUuid,
        ),
    ).toMatchObject({
        status: 'failed',
        lastSuccessfulAt: finishedAt.toISOString(),
        finishedAt: nextFinishedAt.toISOString(),
        stats: { partitionsCompacted: 1, partitionsFailed: 1 },
    });
    expect(
        await migrated
            .database(UsageProcessingStatusTableName)
            .where('organization_uuid', organizationUuid),
    ).toHaveLength(1);
});

test('keeps organizations isolated and cascades organization deletion', async () => {
    const first = await fixture();
    const second = await fixture();
    await first.model.start([first.organizationUuid], first.runUuid, startedAt);
    expect(await first.model.find(second.organizationUuid)).toBeNull();
    await migrated
        .database('organizations')
        .where('organization_uuid', first.organizationUuid)
        .delete();
    expect(await first.model.find(first.organizationUuid)).toBeNull();
    await expect(
        first.model.start([randomUUID()], randomUUID(), startedAt),
    ).rejects.toMatchObject({ code: '23503' });
});

test('ignores an old start and completion after a newer attempt starts', async () => {
    const { model, organizationUuid, runUuid } = await fixture();
    await model.start([organizationUuid], runUuid, startedAt);
    const nextRun = randomUUID();
    await model.start([organizationUuid], nextRun, nextStartedAt);
    await model.start([organizationUuid], runUuid, startedAt);
    await model.finish({
        organizationUuid,
        runUuid,
        status: 'success',
        finishedAt,
        stats: stats(),
    });
    expect(await model.find(organizationUuid)).toMatchObject({
        status: 'running',
        startedAt: nextStartedAt.toISOString(),
        lastSuccessfulAt: null,
    });
});

test.each([
    { partitionsCompacted: -1 },
    { partitionsFailed: 0.5 },
    { rawObjectsDeleted: Infinity },
    { dimensionsFailed: Number.MAX_SAFE_INTEGER + 1 },
    { partitionsCompacted: 2, partitionsFailed: 1 },
    { userPartitionsDeferred: '1' },
    { limitReached: 'false' },
    { unexpected: 1 },
])('rejects invalid statistics %j', async (invalid) => {
    const { model, organizationUuid, runUuid } = await fixture();
    await model.start([organizationUuid], runUuid, startedAt);
    await expect(
        model.finish({
            organizationUuid,
            runUuid,
            status: 'failed',
            finishedAt,
            stats: { ...stats(), ...invalid } as AnalyticsProcessingStats,
        }),
    ).rejects.toThrow('Invalid usage processing statistics');
    expect(await model.find(organizationUuid)).toMatchObject({
        status: 'running',
    });
});

test.each([
    { partitionsCompacted: 1 },
    { dimensionsFailed: 1 },
    { userPartitionsFailed: 1 },
    { userPartitionsDeferred: 1 },
    { limitReached: true },
])('does not persist success with incomplete work %j', async (incomplete) => {
    const { model, organizationUuid, runUuid } = await fixture();
    await model.start([organizationUuid], runUuid, startedAt);
    await expect(
        model.finish({
            organizationUuid,
            runUuid,
            status: 'success',
            finishedAt,
            stats: { ...stats(), ...incomplete },
        }),
    ).rejects.toThrow('Invalid usage processing statistics');
});

test('fails closed for corrupt stored statistics', async () => {
    const { model, organizationUuid, runUuid } = await fixture();
    await model.start([organizationUuid], runUuid, startedAt);
    await migrated.database.raw(
        'UPDATE ?? SET stats = ?::jsonb WHERE organization_uuid = ?',
        [
            UsageProcessingStatusTableName,
            JSON.stringify({ partitionsFailed: -1 }),
            organizationUuid,
        ],
    );
    expect(await model.find(organizationUuid)).toBeNull();
});

test('rejects invalid dates and terminal statuses without changing stored state', async () => {
    const { model, organizationUuid, runUuid } = await fixture();
    await expect(
        model.start([organizationUuid], runUuid, new Date('invalid')),
    ).rejects.toThrow('Invalid usage processing start time');
    await model.start([organizationUuid], runUuid, startedAt);
    for (const invalid of [
        { finishedAt: new Date('invalid') },
        { status: 'running' },
        { status: 'unexpected' },
    ]) {
        // eslint-disable-next-line no-await-in-loop
        await expect(
            model.finish({
                organizationUuid,
                runUuid,
                status: 'success',
                finishedAt,
                stats: stats(),
                ...invalid,
            } as Parameters<UsageProcessingModel['finish']>[0]),
        ).rejects.toThrow('Invalid usage processing result');
    }
    await model.finish({
        organizationUuid,
        runUuid,
        status: 'success',
        finishedAt: new Date(startedAt.getTime() - 1),
        stats: stats(),
    });
    expect(await model.find(organizationUuid)).toMatchObject({
        status: 'running',
        lastSuccessfulAt: null,
    });
});

test('reverses and reapplies the additive migration', async () => {
    await migrated.database.transaction(async (trx) => {
        await down(trx);
        expect(await trx.schema.hasTable(UsageProcessingStatusTableName)).toBe(
            false,
        );
        await up(trx);
        expect(await trx.schema.hasTable(UsageProcessingStatusTableName)).toBe(
            true,
        );
    });
});
