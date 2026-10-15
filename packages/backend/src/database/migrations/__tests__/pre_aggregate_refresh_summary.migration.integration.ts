import {
    ForbiddenError,
    UnexpectedServerError,
    type Explore,
} from '@lightdash/common';
import { agentExecutionContext } from '../../../services/AiAccessService/agentExecutionContext';
import { refreshShapes } from '../../../services/ProjectService/preAggregateRefresh.shapes.mock';
import { validExplore } from '../../../services/ProjectService/ProjectService.mock';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { seedConnectionClient } from './agentConnectionFixture.mock';
import { measure } from './launch-measurements/metrics';
import { refreshFixture } from './preAggregateRefresh.mock';

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
beforeEach(async () => {
    await migrated
        .database('cached_explore')
        .where('project_uuid', f.projectUuid)
        .delete();
});
const outcome = async (run: () => Promise<unknown>) => {
    try {
        await run();
        return 'allowed';
    } catch (error) {
        return error;
    }
};

test.each(refreshShapes)(
    'real save and one statement: $name',
    async ({ fields, scheduled, malformed, previous }) => {
        await f.save([{ ...validExplore, ...fields } as unknown as Explore]);
        const prior = await agentExecutionContext.run(f.scope, () =>
            outcome(() =>
                f.reference.assertConnectionPreAggregateRefresh(f.projectUuid),
            ),
        );
        if (previous === 'TypeError') expect(prior).toBeInstanceOf(TypeError);
        else if (previous === 'scheduled')
            expect(prior).toBeInstanceOf(ForbiddenError);
        else expect(prior).toBe('allowed');
        const captured = await measure(migrated.database, () =>
            f.projects.getPreAggregateRefreshSummary(f.projectUuid),
        );
        expect(captured.value).toEqual({
            hasScheduledDefinition: false,
            hasScheduledRefresh: scheduled,
            hasMalformedPreAggregates: malformed,
        });
        expect(captured.sample.statements).toBe(1);
        expect(captured.sample.rows).toBe(1);
        const actual = await agentExecutionContext.run(f.scope, () =>
            outcome(() =>
                f.service.assertConnectionPreAggregateRefresh(f.projectUuid),
            ),
        );
        if (scheduled) expect(actual).toEqual(prior);
        else if (malformed)
            expect(actual).toBeInstanceOf(UnexpectedServerError);
        else expect(actual).toBe('allowed');
    },
);

test.each([null, 5, 'abc', false])(
    'direct scalar %j fails closed',
    async (value) => {
        await migrated
            .database('cached_explore')
            .where('project_uuid', f.projectUuid)
            .delete();
        await migrated.database('cached_explore').insert({
            project_uuid: f.projectUuid,
            name: 'malformed',
            table_names: [],
            explore: JSON.stringify(value),
        });
        const prior = await agentExecutionContext.run(f.scope, () =>
            outcome(() =>
                f.reference.assertConnectionPreAggregateRefresh(f.projectUuid),
            ),
        );
        expect(prior).toBeInstanceOf(TypeError);
        const actual = await agentExecutionContext.run(f.scope, () =>
            outcome(() =>
                f.service.assertConnectionPreAggregateRefresh(f.projectUuid),
            ),
        );
        expect(actual).toBeInstanceOf(UnexpectedServerError);
    },
);

test('an error explore without pre-aggregates is allowed', async () => {
    await migrated
        .database('cached_explore')
        .where('project_uuid', f.projectUuid)
        .delete();
    await migrated.database('cached_explore').insert({
        project_uuid: f.projectUuid,
        name: 'error',
        table_names: [],
        explore: { name: 'error', errors: [] },
    });
    expect(
        await f.projects.getPreAggregateRefreshSummary(f.projectUuid),
    ).toEqual({
        hasScheduledDefinition: false,
        hasScheduledRefresh: false,
        hasMalformedPreAggregates: false,
    });
});

test.each([false, true])(
    'scheduled stored row wins regardless of malformed insertion order %s',
    async (reverse) => {
        const explores = [
            { ...validExplore, name: 'bad', preAggregates: [null] },
            { ...f.withCron(''), name: 'scheduled' },
        ];
        if (reverse) explores.reverse();
        await f.save(explores as unknown as Explore[]);
        await expect(
            agentExecutionContext.run(f.scope, () =>
                f.service.assertConnectionPreAggregateRefresh(f.projectUuid),
            ),
        ).rejects.toBeInstanceOf(ForbiddenError);
    },
);

test('empty project, other project, and definition-only schedule are distinct', async () => {
    const otherProject = await f.createProject();
    await f.projects.saveExploresToCache(otherProject, [f.withCron('')], true);
    const clean = {
        hasScheduledDefinition: false,
        hasScheduledRefresh: false,
        hasMalformedPreAggregates: false,
    };
    expect(
        await f.projects.getPreAggregateRefreshSummary(f.projectUuid),
    ).toEqual(clean);
    await f.save([validExplore]);
    const [cached] = await migrated
        .database('cached_explore')
        .where('project_uuid', f.projectUuid);
    await migrated.database('pre_aggregate_definitions').insert({
        project_uuid: f.projectUuid,
        source_cached_explore_uuid: cached.cached_explore_uuid,
        pre_agg_cached_explore_uuid: cached.cached_explore_uuid,
        pre_aggregate_definition: {
            name: 'daily',
            dimensions: [],
            metrics: [],
        },
        materialization_metric_query: null,
        materialization_query_error: null,
        refresh_cron: '',
        materialize_on_compile: true,
    });
    expect(
        await f.projects.getPreAggregateRefreshSummary(f.projectUuid),
    ).toEqual({ ...clean, hasScheduledDefinition: true });
});

test('optional transaction sees its own uncommitted stored schedule', async () => {
    await f.save([validExplore]);
    const trx = await migrated.database.transaction();
    try {
        await trx('cached_explore')
            .where('project_uuid', f.projectUuid)
            .update({ explore: f.withCron('') });
        expect(
            (await f.projects.getPreAggregateRefreshSummary(f.projectUuid, trx))
                .hasScheduledRefresh,
        ).toBe(true);
        expect(
            (await f.projects.getPreAggregateRefreshSummary(f.projectUuid))
                .hasScheduledRefresh,
        ).toBe(false);
    } finally {
        await trx.rollback();
    }
});
