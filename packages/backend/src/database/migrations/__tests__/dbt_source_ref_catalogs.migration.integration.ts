import { DbtProjectType, ProjectType } from '@lightdash/common';
import { randomUUID } from 'crypto';
import { placeholderExternalNode } from '../../../dbt/dbtExternalNodes';
import { DbtSourceRefCatalogModel } from '../../../models/DbtSourceRefCatalogModel';
import { CrossSourceCatalogCache } from '../../../projectAdapters/crossSourceCatalogCache';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { down, up } from '../20261020154000_add_dbt_source_ref_catalogs';

let migrated: MigratedDatabase;
let projectUuid: string;
let model: DbtSourceRefCatalogModel;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
    const [org] = await migrated
        .database('organizations')
        .insert({ organization_name: 'Ref catalogue fixture' })
        .returning('organization_id');
    const [project] = await migrated
        .database('projects')
        .insert({
            name: 'Ref fixture',
            organization_id: org.organization_id,
            project_type: ProjectType.DEFAULT,
            dbt_connection_type: DbtProjectType.NONE,
            dbt_connection: null,
            copied_from_project_uuid: null,
            dbt_version: 'v1.9',
            created_by_user_uuid: null,
            organization_warehouse_credentials_uuid: null,
        })
        .returning('project_uuid');
    projectUuid = project.project_uuid;
    model = new DbtSourceRefCatalogModel({ database: migrated.database });
});
afterAll(async () => migrated?.destroy());
beforeEach(async () => model.deleteForProject(projectUuid, null));

const node = (version: string | null = null) =>
    placeholderExternalNode({
        packageName: 'provider',
        name: 'orders',
        version,
        latestVersion: version,
    });
const write = (
    dbtSourceUuid: string,
    connectionGroup = 'original',
    nodes = [node()],
    referencedProjects: string[] = [],
) =>
    model.upsertProvisional({
        projectUuid,
        dbtSourceUuid,
        connectionGroup,
        projectName: 'provider',
        dbtVersion: 'v1.9',
        nodes,
        referencedProjects,
        compileJobUuid: 'job-fixture',
    });

const publish = (
    dbtSourceUuid: string,
    connectionGroup = 'original',
    nodes = [node('3')],
) =>
    model.replaceConfirmed({
        projectUuid,
        connectionGroup,
        dbtVersion: 'v1.12',
        compileJobUuid: null,
        entries: [
            {
                dbtSourceUuid,
                projectName: 'provider',
                nodes,
                referencedProjects: [],
            },
        ],
    });

test('creates the cache on the real schema and reverses the migration', async () => {
    await migrated.database.transaction(async (trx) => {
        await down(trx);
        expect(await trx.schema.hasTable('dbt_source_ref_catalogs')).toBe(
            false,
        );
        await up(trx);
        expect(await trx.schema.hasTable('dbt_source_ref_catalogs')).toBe(true);
        const [primary] = await trx
            .raw(
                "SELECT count(*)::int AS count FROM pg_constraint WHERE conrelid = 'dbt_source_ref_catalogs'::regclass AND contype = 'p'",
            )
            .then((result) => result.rows);
        expect(primary.count).toBe(1);
    });
});

test('loads only confirmed catalogues and replaces provisional rows before confirmation', async () => {
    const source = randomUUID();
    await write(source, 'original', [node('1'), node('2')], ['old_provider']);
    const digest = await write(source, 'original', [node('2')], ['upstream']);
    expect(await model.get(projectUuid, 'original')).toEqual([]);
    const rows = await migrated
        .database('dbt_source_ref_catalogs')
        .where({ project_uuid: projectUuid, connection_group: 'original' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
        status: 'provisional',
        nodes: [node('2')],
        referenced_projects: ['upstream'],
        nodes_digest: digest,
        compile_job_uuid: 'job-fixture',
    });
    await model.confirm({
        projectUuid,
        connectionGroup: 'original',
        entries: [{ dbtSourceUuid: source, nodesDigest: digest }],
    });
    expect((await model.get(projectUuid, 'original'))[0].status).toBe(
        'confirmed',
    );
});

test('does not confirm a concurrent run with a different digest', async () => {
    const source = randomUUID();
    const first = await write(source, 'original', [node('1')]);
    const second = await write(source, 'original', [node('2')]);
    await model.confirm({
        projectUuid,
        connectionGroup: 'original',
        entries: [{ dbtSourceUuid: source, nodesDigest: first }],
    });
    expect(await model.get(projectUuid, 'original')).toEqual([]);
    expect(
        await migrated
            .database('dbt_source_ref_catalogs')
            .where({ dbt_source_uuid: source })
            .first(),
    ).toMatchObject({
        status: 'provisional',
        nodes_digest: second,
    });
});

test('isolates connection groups and deletes all source rows on invalidation', async () => {
    const source = randomUUID();
    const other = randomUUID();
    await publish(source);
    await publish(source, 'extra');
    await publish(other, 'extra');
    expect(await model.get(projectUuid, 'original')).toHaveLength(1);
    await model.deleteForSource(projectUuid, source);
    expect(await model.get(projectUuid, 'original')).toEqual([]);
    expect(await model.get(projectUuid, 'extra')).toHaveLength(1);
    await model.deleteForProject(projectUuid, 'original');
    expect(await model.get(projectUuid, 'extra')).toHaveLength(1);
    await model.deleteForProject(projectUuid, null);
    expect(await model.get(projectUuid, 'extra')).toEqual([]);
});

test('deletes only the requested connection group across all its sources', async () => {
    const source = randomUUID();
    const other = randomUUID();
    await publish(source);
    await publish(source, 'extra');
    await publish(other, 'extra');
    await publish(other, 'retained');
    await model.deleteForProject(projectUuid, 'extra');
    expect(await model.get(projectUuid, 'extra')).toEqual([]);
    expect(await model.get(projectUuid, 'original')).toHaveLength(1);
    expect(await model.get(projectUuid, 'retained')).toHaveLength(1);
});

test('cascades cache rows when their project is removed', async () => {
    await write(randomUUID());
    await migrated.database
        .transaction(async (trx) => {
            await trx('projects').where('project_uuid', projectUuid).delete();
            expect(
                await trx('dbt_source_ref_catalogs').where(
                    'project_uuid',
                    projectUuid,
                ),
            ).toEqual([]);
            throw new Error('roll back fixture deletion');
        })
        .catch((error: Error) =>
            expect(error.message).toBe('roll back fixture deletion'),
        );
});

test('stores an empty referenced-project list by default and rejects null', async () => {
    const source = randomUUID();
    await write(source);
    await migrated
        .database('dbt_source_ref_catalogs')
        .where({ dbt_source_uuid: source })
        .delete();
    const row = {
        project_uuid: projectUuid,
        dbt_source_uuid: source,
        connection_group: 'original',
        project_name: 'provider',
        dbt_version: 'v1.9',
        status: 'provisional' as const,
        nodes: '[]',
        nodes_digest: 'default-fixture',
        compile_job_uuid: null,
    };
    await migrated.database('dbt_source_ref_catalogs').insert(row);
    expect(
        (
            await migrated
                .database('dbt_source_ref_catalogs')
                .where({ dbt_source_uuid: source })
                .first()
        )?.referenced_projects,
    ).toEqual([]);
    await expect(
        migrated.database.raw(
            'UPDATE dbt_source_ref_catalogs SET referenced_projects = NULL WHERE dbt_source_uuid = ?',
            [source],
        ),
    ).rejects.toMatchObject({ code: '23502' });
});

test('does not confirm a concurrent run with changed references but identical nodes', async () => {
    const source = randomUUID();
    const first = await write(source, 'original', [node()], ['old_provider']);
    const second = await write(source, 'original', [node()], ['new_provider']);
    expect(second).not.toBe(first);
    await model.confirm({
        projectUuid,
        connectionGroup: 'original',
        entries: [{ dbtSourceUuid: source, nodesDigest: first }],
    });
    expect(await model.get(projectUuid, 'original')).toEqual([]);
    expect(
        await migrated
            .database('dbt_source_ref_catalogs')
            .where({ dbt_source_uuid: source })
            .first(),
    ).toMatchObject({
        status: 'provisional',
        referenced_projects: ['new_provider'],
        nodes_digest: second,
    });
});

test('preserves the last-good catalogue when a later compile stages or discards nodes', async () => {
    const source = randomUUID();
    await publish(source);
    const previous = await model.get(projectUuid, 'original');
    const cache = new CrossSourceCatalogCache(
        model,
        projectUuid,
        'original',
        'v1.12',
        'failed-job',
    );
    await cache.resolved(source, [node('2')], 'provider', ['changed']);
    expect(await model.get(projectUuid, 'original')).toEqual(previous);
    cache.discard(source);
    await cache.confirm();
    expect(await model.get(projectUuid, 'original')).toEqual(previous);
    const restarted = new CrossSourceCatalogCache(
        new DbtSourceRefCatalogModel({ database: migrated.database }),
        projectUuid,
        'original',
        'v1.12',
        null,
    );
    expect(
        await restarted.load([{ key: 'renamed provider', uuid: source }]),
    ).toEqual([
        {
            key: 'renamed provider',
            projectName: 'provider',
            nodes: [node('3')],
            referencedProjects: [],
        },
    ]);
});

test('publishes complete replacement nodes only on successful confirmation', async () => {
    const source = randomUUID();
    await publish(source);
    const cache = new CrossSourceCatalogCache(
        model,
        projectUuid,
        'original',
        'v1.12',
        'successful-job',
    );
    const nodes = [
        {
            ...node('4'),
            access: 'private' as const,
            schema: 'analytics',
            relation_name: 'sim.analytics.orders_v4',
            identifier: 'orders_v4',
            depends_on_nodes: ['model.provider.base'],
        },
    ];
    await cache.resolved(source, nodes, 'provider', ['upstream']);
    expect((await model.get(projectUuid, 'original'))[0].nodes).toEqual([
        node('3'),
    ]);
    await cache.confirm();
    expect(await model.get(projectUuid, 'original')).toMatchObject([
        {
            status: 'confirmed',
            nodes,
            referenced_projects: ['upstream'],
            compile_job_uuid: 'successful-job',
        },
    ]);
});

test('does not let a provisional write replace an already confirmed snapshot', async () => {
    const source = randomUUID();
    await publish(source);
    const previous = await model.get(projectUuid, 'original');
    const digest = await write(source, 'original', [node('2')]);
    await model.confirm({
        projectUuid,
        connectionGroup: 'original',
        entries: [{ dbtSourceUuid: source, nodesDigest: digest }],
    });
    expect(await model.get(projectUuid, 'original')).toEqual(previous);
});

test('rolls back the complete publication batch when one source cannot be stored', async () => {
    const source = randomUUID();
    await publish(source);
    const previous = await model.get(projectUuid, 'original');
    await expect(
        model.replaceConfirmed({
            projectUuid,
            connectionGroup: 'original',
            dbtVersion: 'v1.12',
            compileJobUuid: null,
            entries: [source, 'invalid-source-uuid'].map((dbtSourceUuid) => ({
                dbtSourceUuid,
                projectName: 'provider',
                nodes: [node('2')],
                referencedProjects: [],
            })),
        }),
    ).rejects.toMatchObject({ code: '22P02' });
    expect(await model.get(projectUuid, 'original')).toEqual(previous);
});
