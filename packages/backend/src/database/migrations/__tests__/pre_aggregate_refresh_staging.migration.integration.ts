import {
    ExploreType,
    ForbiddenError,
    UnexpectedServerError,
    type Explore,
} from '@lightdash/common';
import { randomUUID } from 'node:crypto';
import { agentExecutionContext } from '../../../services/AiAccessService/agentExecutionContext';
import { refreshShapes } from '../../../services/ProjectService/preAggregateRefresh.shapes.mock';
import { validExplore } from '../../../services/ProjectService/ProjectService.mock';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { seedConnectionClient } from './agentConnectionFixture.mock';
import { refreshFixture } from './preAggregateRefresh.mock';
import { transactionFixture } from './preAggregateRefreshTransaction.mock';

vi.mock('../../../config/lightdashConfig', async () => {
    const { lightdashConfigMock } =
        await import('../../../config/lightdashConfig.mock');
    return { lightdashConfig: lightdashConfigMock };
});

let migrated: MigratedDatabase;
let f: Awaited<ReturnType<typeof refreshFixture>>;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
    await seedConnectionClient(migrated.database);
    f = await refreshFixture(migrated.database);
});
afterAll(async () => migrated?.destroy());

test.each(refreshShapes)(
    'staged and stored facts agree: $name',
    async ({ fields, scheduled, malformed }) => {
        const incoming = { ...validExplore, ...fields } as unknown as Explore;
        await f.save([incoming]);
        const saveUuid = randomUUID();
        await migrated.database.transaction(async (trx) => {
            await trx('cached_explore_staging').insert({
                project_uuid: f.projectUuid,
                save_uuid: saveUuid,
                name: incoming.name,
                table_names: Object.keys(incoming.tables ?? {}),
                explore: incoming,
            });
            await trx('cached_explore_staging').insert({
                project_uuid: f.projectUuid,
                save_uuid: randomUUID(),
                name: 'other_save',
                table_names: [],
                explore: f.withCron(''),
            });
            const staged = await f.projects.getStagedPreAggregateRefreshSummary(
                f.projectUuid,
                saveUuid,
                trx,
            );
            expect(staged).toEqual({
                hasScheduledDefinition: false,
                hasScheduledRefresh: scheduled,
                hasMalformedPreAggregates: malformed,
            });
            expect(staged).toEqual(
                await f.projects.getPreAggregateRefreshSummary(
                    f.projectUuid,
                    trx,
                ),
            );
        });
    },
);

afterEach(() => vi.restoreAllMocks());

test.each(
    ['stream', 'multi'].flatMap((operation) =>
        ['scheduled', 'malformed', 'both'].map((shape) => ({
            operation,
            shape,
        })),
    ),
)(
    '$operation refuses $shape staged rows after clean admission and cleans up',
    async ({ operation, shape }) => {
        const fixture = await transactionFixture(migrated.database, operation);
        const summary =
            fixture.projects.getStagedPreAggregateRefreshSummary.bind(
                fixture.projects,
            );
        const preAggregates: unknown[] =
            shape === 'malformed' ? [null] : [{ refresh: { cron: '' } }];
        if (shape === 'both') preAggregates.unshift(null);
        const staged = vi
            .spyOn(fixture.projects, 'getStagedPreAggregateRefreshSummary')
            .mockImplementationOnce(async (projectUuid, saveUuid, trx) => {
                await trx('cached_explore_staging')
                    .where({ project_uuid: projectUuid, save_uuid: saveUuid })
                    .update({
                        explore: {
                            ...validExplore,
                            preAggregates,
                        },
                    });
                return summary(projectUuid, saveUuid, trx);
            });
        const before = await migrated
            .database('cached_explore')
            .where('project_uuid', fixture.projectUuid);
        await expect(
            agentExecutionContext.run(fixture.scope, fixture.run),
        ).rejects.toBeInstanceOf(
            shape === 'malformed' ? UnexpectedServerError : ForbiddenError,
        );
        expect(staged).toHaveBeenCalledOnce();
        expect(
            await migrated
                .database('cached_explore')
                .where('project_uuid', fixture.projectUuid),
        ).toEqual(before);
        expect(
            await migrated
                .database('cached_explore_staging')
                .where('project_uuid', fixture.projectUuid),
        ).toEqual([]);
    },
);

test.each(['stream', 'multi'])(
    '$operation checks staged user-managed and carried rows before promotion',
    async (operation) => {
        const fixture = await transactionFixture(migrated.database, operation);
        await fixture.save([
            { ...validExplore, name: 'managed', type: ExploreType.VIRTUAL },
            {
                ...validExplore,
                name: 'carried',
                dbtSourceUuid: randomUUID(),
            } as Explore,
        ]);
        if (operation === 'multi') {
            const save = fixture.projects.saveMultiConnectionExplores.bind(
                fixture.projects,
            );
            vi.spyOn(
                fixture.projects,
                'saveMultiConnectionExplores',
            ).mockImplementationOnce((id, stream, _carry, check) =>
                save(
                    id,
                    stream,
                    {
                        kind: 'otherDbtSources',
                        dbtSourceUuid: randomUUID(),
                        warehouseConnectionUuid: null,
                    },
                    check,
                ),
            );
        }
        const summary =
            fixture.projects.getStagedPreAggregateRefreshSummary.bind(
                fixture.projects,
            );
        const staged = vi
            .spyOn(fixture.projects, 'getStagedPreAggregateRefreshSummary')
            .mockImplementationOnce(async (projectUuid, saveUuid, trx) => {
                const rows = await trx('cached_explore_staging')
                    .where({ project_uuid: projectUuid, save_uuid: saveUuid })
                    .orderBy('name');
                expect(rows.map((row) => row.name)).toEqual(
                    operation === 'multi'
                        ? ['carried', 'connection_write', 'managed']
                        : ['connection_write', 'managed'],
                );
                await trx('cached_explore_staging')
                    .where({
                        project_uuid: projectUuid,
                        save_uuid: saveUuid,
                        name: operation === 'multi' ? 'carried' : 'managed',
                    })
                    .update({ explore: fixture.withCron('') });
                return summary(projectUuid, saveUuid, trx);
            });
        const before = await migrated
            .database('cached_explore')
            .where('project_uuid', fixture.projectUuid);
        await expect(
            agentExecutionContext.run(fixture.scope, fixture.run),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(staged).toHaveBeenCalledOnce();
        expect(
            await migrated
                .database('cached_explore')
                .where('project_uuid', fixture.projectUuid),
        ).toEqual(before);
        expect(
            await migrated
                .database('cached_explore_staging')
                .where('project_uuid', fixture.projectUuid),
        ).toEqual([]);
    },
);
