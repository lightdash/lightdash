import { randomUUID } from 'node:crypto';
import { PreAggregateModel } from '../../../ee/models/PreAggregateModel';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { connectionFixture } from './agentConnectionFixture.mock';

vi.mock('../../../config/lightdashConfig', async () => {
    const { lightdashConfigMock } =
        await import('../../../config/lightdashConfig.mock');
    return { lightdashConfig: lightdashConfigMock };
});

const PRE_AGG_EXPLORE_NAME = 'orders__by_country';

let migrated: MigratedDatabase;
let projectUuid: string;
let organizationUuid: string;
let userUuid: string;
let model: PreAggregateModel;
let sourceCachedExploreUuid: string;
let preAggCachedExploreUuid: string;
let definitionUuid: string;

beforeAll(async () => {
    migrated = await createMigratedDatabase();
    const f = await connectionFixture(migrated.database);
    projectUuid = f.projectUuid;
    organizationUuid = f.organizationUuid;
    userUuid = f.userUuid;
    model = new PreAggregateModel({ database: migrated.database });
    const [source] = await migrated
        .database('cached_explore')
        .insert({
            project_uuid: projectUuid,
            name: 'orders',
            table_names: ['orders'],
            explore: { name: 'orders' },
        })
        .returning('cached_explore_uuid');
    const [preAgg] = await migrated
        .database('cached_explore')
        .insert({
            project_uuid: projectUuid,
            name: PRE_AGG_EXPLORE_NAME,
            table_names: ['orders'],
            explore: { name: PRE_AGG_EXPLORE_NAME },
        })
        .returning('cached_explore_uuid');
    sourceCachedExploreUuid = source.cached_explore_uuid;
    preAggCachedExploreUuid = preAgg.cached_explore_uuid;
});
afterAll(async () => migrated?.destroy());

const upsert = (definitionFingerprint: string | null) =>
    model.upsertPreAggregateDefinitions([
        {
            project_uuid: projectUuid,
            source_cached_explore_uuid: sourceCachedExploreUuid,
            pre_agg_cached_explore_uuid: preAggCachedExploreUuid,
            pre_aggregate_definition: {
                name: 'by_country',
                dimensions: [],
                metrics: [],
            },
            materialization_metric_query: null,
            materialization_query_error: null,
            refresh_cron: null,
            materialize_on_change: false,
            definition_fingerprint: definitionFingerprint,
        },
    ]);

let materializedAt = new Date('2026-01-01T00:00:00.000Z');
const build = async (definitionFingerprint: string | null) => {
    const { materializationUuid } = await model.insertInProgress({
        projectUuid,
        preAggregateDefinitionUuid: definitionUuid,
        trigger: 'compile',
        definitionFingerprint,
    });
    return materializationUuid;
};
const promote = async (materializationUuid: string) => {
    materializedAt = new Date(materializedAt.getTime() + 60_000);
    const [query] = await migrated
        .database('query_history')
        .insert({
            project_uuid: projectUuid,
            organization_uuid: organizationUuid,
            created_by_user_uuid: userUuid,
            context: 'preAggregateMaterialization',
            default_page_size: 10,
            compiled_sql: 'select 1',
            metric_query: {},
            fields: {},
            request_parameters: {},
            status: 'ready',
            cache_key: randomUUID(),
        } as never)
        .returning('query_uuid');
    return model.promoteToActive({
        materializationUuid,
        queryUuid: query.query_uuid,
        materializationUri: `s3://bucket/${materializationUuid}.parquet`,
        materializedAt,
        rowCount: 1,
        columns: null,
        totalBytes: 10,
    });
};
const statusOf = async (materializationUuid: string) => {
    const row = await migrated
        .database('pre_aggregate_materializations')
        .where('pre_aggregate_materialization_uuid', materializationUuid)
        .first('status');
    return row?.status;
};
const served = () =>
    model.getActiveMaterialization(projectUuid, PRE_AGG_EXPLORE_NAME);

test('first upsert stores the fingerprint and supersedes nothing', async () => {
    expect(await upsert('fp-a')).toEqual({ supersededDefinitionUuids: [] });
    const [row] = await model.getPreAggregateDefinitionsForProject(projectUuid);
    definitionUuid = row.preAggregateDefinitionUuid;
    expect(row.definitionFingerprint).toBe('fp-a');
});

test('an unchanged fingerprint keeps the active materialization', async () => {
    const first = await build('fp-a');
    expect(await promote(first)).toEqual({ status: 'active' });
    expect(await upsert('fp-a')).toEqual({ supersededDefinitionUuids: [] });
    expect(await statusOf(first)).toBe('active');
    expect((await served())?.materializationUuid).toBe(first);
});

test('a changed fingerprint supersedes the active materialization', async () => {
    const [active] = await migrated
        .database('pre_aggregate_materializations')
        .where({
            pre_aggregate_definition_uuid: definitionUuid,
            status: 'active',
        })
        .select('pre_aggregate_materialization_uuid');
    expect(await upsert('fp-b')).toEqual({
        supersededDefinitionUuids: [definitionUuid],
    });
    expect(await statusOf(active.pre_aggregate_materialization_uuid)).toBe(
        'superseded',
    );
    expect(await served()).toBeUndefined();
    // Nothing active any more, so a second sync has nothing to supersede
    expect(await upsert('fp-c')).toEqual({ supersededDefinitionUuids: [] });
});

test('a run built for an older definition never becomes active', async () => {
    const stale = await build('fp-c');
    await upsert('fp-d');
    expect(await promote(stale)).toEqual({ status: 'superseded' });
    expect(await statusOf(stale)).toBe('superseded');
    expect(await served()).toBeUndefined();

    const fresh = await build('fp-d');
    expect(await promote(fresh)).toEqual({ status: 'active' });
    expect((await served())?.materializationUuid).toBe(fresh);
});

test('a definition with no stored fingerprint takes the new one as baseline', async () => {
    await migrated
        .database('pre_aggregate_definitions')
        .where('pre_aggregate_definition_uuid', definitionUuid)
        .update({ definition_fingerprint: null });
    const legacy = await build(null);
    expect(await promote(legacy)).toEqual({ status: 'active' });

    expect(await upsert('fp-e')).toEqual({ supersededDefinitionUuids: [] });
    expect(await statusOf(legacy)).toBe('active');
    expect((await served())?.materializationUuid).toBe(legacy);
});
