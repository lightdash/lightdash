import { ForbiddenError } from '@lightdash/common';
import { agentExecutionContext } from '../../../services/AiAccessService/agentExecutionContext';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { seedConnectionClient } from './agentConnectionFixture.mock';
import { transactionFixture } from './preAggregateRefreshTransaction.mock';

vi.mock('../../../config/lightdashConfig', async () => {
    const { lightdashConfigMock } =
        await import('../../../config/lightdashConfig.mock');
    return { lightdashConfig: lightdashConfigMock };
});

let migrated: MigratedDatabase;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
    await seedConnectionClient(migrated.database);
});
afterAll(async () => migrated?.destroy());
afterEach(() => vi.restoreAllMocks());

test('a scheduled batch arriving after both finalize reads is not published', async () => {
    const f = await transactionFixture(migrated.database, 'finalize');
    const reads = vi.spyOn(f.sessions, 'getDeployData');
    const save = f.projects.saveExploresToCache.bind(f.projects);
    let incomingNames: string[] = [];
    vi.spyOn(f.projects, 'saveExploresToCache').mockImplementationOnce(
        async (...args) => {
            expect(reads).toHaveBeenCalledTimes(2);
            await f.sessions.addBatch(
                f.sessionUuid,
                f.projectUuid,
                [{ ...f.withCron(''), name: 'late_scheduled_batch' }],
                1,
                true,
            );
            const data = await f.sessions.getDeployData(f.sessionUuid);
            expect(data.explores.map((item) => item.name)).toEqual([
                'connection_write',
                'late_scheduled_batch',
            ]);
            incomingNames = args[1].map((item) => item.name);
            expect(incomingNames).toEqual(['connection_write']);
            expect(
                await f.projects.getPreAggregateRefreshSummary(f.projectUuid),
            ).toEqual({
                hasScheduledDefinition: false,
                hasScheduledRefresh: false,
                hasMalformedPreAggregates: false,
            });
            return save(...args);
        },
    );
    const error = await agentExecutionContext.run(f.scope, f.run).then(
        () => null,
        (failure: unknown) => failure,
    );
    expect(incomingNames).toEqual(['connection_write']);
    expect(error).toBeNull();
    const published = await migrated
        .database('cached_explore')
        .where('project_uuid', f.projectUuid);
    expect(published.map((row) => row.name)).toEqual(['connection_write']);
    expect(published.map((row) => row.explore.name)).toEqual([
        'connection_write',
    ]);
    expect(
        await f.projects.getPreAggregateRefreshSummary(f.projectUuid),
    ).toEqual({
        hasScheduledDefinition: false,
        hasScheduledRefresh: false,
        hasMalformedPreAggregates: false,
    });
});

test('a scheduled batch between finalize reads is refused without publishing', async () => {
    const f = await transactionFixture(migrated.database, 'finalize');
    const read = f.sessions.getDeployData.bind(f.sessions);
    vi.spyOn(f.sessions, 'getDeployData').mockImplementationOnce(
        async (...args) => {
            const data = await read(...args);
            await f.sessions.addBatch(
                f.sessionUuid,
                f.projectUuid,
                [{ ...f.withCron(''), name: 'between_reads' }],
                1,
                true,
            );
            return data;
        },
    );
    const before = await migrated
        .database('cached_explore')
        .where('project_uuid', f.projectUuid);
    await expect(
        agentExecutionContext.run(f.scope, f.run),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(
        await migrated
            .database('cached_explore')
            .where('project_uuid', f.projectUuid),
    ).toEqual(before);
    expect(
        (await read(f.sessionUuid)).explores.map((item) => item.name),
    ).toEqual(['connection_write', 'between_reads']);
});

test('the array transaction alone refuses a scheduled explore in its exact input', async () => {
    const f = await transactionFixture(migrated.database, 'array');
    const save = f.projects.saveExploresToCache.bind(f.projects);
    const boundary = vi.spyOn(f.projects, 'saveExploresToCache');
    await agentExecutionContext.run(f.scope, f.run);
    const args = boundary.mock.calls[0];
    expect(typeof args[5]).toBe('function');
    const before = await migrated
        .database('cached_explore')
        .where('project_uuid', f.projectUuid);
    const incoming = [...args[1], { ...f.withCron(''), name: 'between_reads' }];
    await expect(
        save(args[0], incoming, args[2], args[3], args[4], args[5]),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(
        await migrated
            .database('cached_explore')
            .where('project_uuid', f.projectUuid),
    ).toEqual(before);
});
