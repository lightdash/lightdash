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

const HOUR_MS = 60 * 60 * 1000;

let migrated: MigratedDatabase;
let projectUuid: string;
let organizationUuid: string;
let userUuid: string;
let model: PreAggregateModel;
let definitionUuid: string;

beforeAll(async () => {
    migrated = await createMigratedDatabase();
    const f = await connectionFixture(migrated.database);
    projectUuid = f.projectUuid;
    organizationUuid = f.organizationUuid;
    userUuid = f.userUuid;
    model = new PreAggregateModel({ database: migrated.database });
    const [source, preAgg] = await migrated
        .database('cached_explore')
        .insert([
            {
                project_uuid: projectUuid,
                name: 'orders',
                table_names: ['orders'],
                explore: { name: 'orders' },
            },
            {
                project_uuid: projectUuid,
                name: 'orders__by_country',
                table_names: ['orders'],
                explore: { name: 'orders__by_country' },
            },
        ])
        .returning('cached_explore_uuid');
    await model.upsertPreAggregateDefinitions([
        {
            project_uuid: projectUuid,
            source_cached_explore_uuid: source.cached_explore_uuid,
            pre_agg_cached_explore_uuid: preAgg.cached_explore_uuid,
            pre_aggregate_definition: {
                name: 'by_country',
                dimensions: [],
                metrics: [],
            },
            materialization_metric_query: null,
            materialization_query_error: null,
            refresh_cron: null,
            materialize_on_change: false,
            definition_fingerprint: null,
        },
    ]);
    const [definition] =
        await model.getPreAggregateDefinitionsForProject(projectUuid);
    definitionUuid = definition.preAggregateDefinitionUuid;
});
afterAll(async () => migrated?.destroy());

let materializedAt = new Date('2026-01-01T00:00:00.000Z');
const refresh = async () => {
    const { materializationUuid } = await model.insertInProgress({
        projectUuid,
        preAggregateDefinitionUuid: definitionUuid,
        trigger: 'compile',
        definitionFingerprint: null,
    });
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
    const uri = `s3://bucket/${materializationUuid}.parquet`;
    await model.promoteToActive({
        materializationUuid,
        queryUuid: query.query_uuid,
        materializationUri: uri,
        materializedAt,
        rowCount: 1,
        columns: null,
        totalBytes: 10,
    });
    return { materializationUuid, uri };
};
const ageBy = (materializationUuid: string, ms: number) =>
    migrated
        .database('pre_aggregate_materializations')
        .where('pre_aggregate_materialization_uuid', materializationUuid)
        .update({
            updated_at: migrated.database.raw(
                `updated_at - interval '${ms / 1000} seconds'`,
            ) as unknown as Date,
        });
const scope = () =>
    model.findMaterializationUrisForProject(projectUuid, {
        retainedSince: new Date(Date.now() - 48 * HOUR_MS),
    });

test('the scope version only moves when the project files change, and a promoted file is in scope once it is served', async () => {
    const first = await refresh();
    const version = await model.getMaterializationScopeVersion(projectUuid);
    expect(await model.getMaterializationScopeVersion(projectUuid)).toBe(
        version,
    );

    const { materializationUuid } = await model.insertInProgress({
        projectUuid,
        preAggregateDefinitionUuid: definitionUuid,
        trigger: 'compile',
        definitionFingerprint: null,
    });
    expect(await model.getMaterializationScopeVersion(projectUuid)).toBe(
        version,
    );
    await model.markFailed({ materializationUuid, errorMessage: 'boom' });

    const second = await refresh();
    expect(await model.getMaterializationScopeVersion(projectUuid)).not.toBe(
        version,
    );
    const served = await model.getActiveMaterialization(
        projectUuid,
        'orders__by_country',
    );
    expect(served?.materializationUri).toBe(second.uri);
    expect(await scope()).toEqual([first.uri, second.uri].sort());
});

test('the scope holds active files and files superseded or failed within the grace window', async () => {
    const old = await refresh();
    const recent = await refresh();
    const failedOld = await refresh();
    await migrated
        .database('pre_aggregate_materializations')
        .where(
            'pre_aggregate_materialization_uuid',
            failedOld.materializationUuid,
        )
        .update({ status: 'failed' });
    const active = await refresh();

    await ageBy(old.materializationUuid, 49 * HOUR_MS);
    await ageBy(failedOld.materializationUuid, 49 * HOUR_MS);
    await ageBy(recent.materializationUuid, 47 * HOUR_MS);
    await ageBy(active.materializationUuid, 1000 * HOUR_MS);

    const uris = await scope();
    expect(uris).toContain(active.uri);
    expect(uris).toContain(recent.uri);
    expect(uris).not.toContain(old.uri);
    expect(uris).not.toContain(failedOld.uri);
});
