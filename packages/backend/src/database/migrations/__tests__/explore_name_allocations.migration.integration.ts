import { ProjectType, SupportedDbtVersions } from '@lightdash/common';
import { type Knex } from 'knex';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { down, up } from '../20261021160000_add_explore_name_allocations';

let migrated: MigratedDatabase;
let database: Knex;
let projectUuid: string;

beforeAll(async () => {
    migrated = await createMigratedDatabase();
    database = migrated.database;
    const [organization] = await database('organizations')
        .insert({ organization_name: 'Explore naming fixture' })
        .returning('organization_id');
    const [project] = await database('projects')
        .insert({
            name: 'Explore naming fixture',
            organization_id: organization.organization_id,
            project_type: ProjectType.DEFAULT,
            dbt_connection_type: null,
            dbt_connection: null,
            dbt_version: SupportedDbtVersions.V1_12,
            organization_warehouse_credentials_uuid: null,
            copied_from_project_uuid: null,
            created_by_user_uuid: null,
        })
        .returning('project_uuid');
    projectUuid = project.project_uuid;
});
afterAll(async () => migrated?.destroy());

const allocation = (sourceKey: string, name = 'orders') => ({
    project_uuid: projectUuid,
    name,
    source_key: sourceKey,
    source_name: 'source',
    package_name: 'package',
    model_unique_id: 'model.package.orders',
    model_name: 'orders',
});

test('creates an empty table with a primary key and reverses the migration', async () => {
    await database.transaction(async (trx) => {
        await down(trx);
        expect(await trx.schema.hasTable('explore_name_allocations')).toBe(
            false,
        );
        await up(trx);
        expect(await trx('explore_name_allocations')).toEqual([]);
        const { rows } = await trx.raw(
            "SELECT count(*)::int AS count FROM pg_constraint WHERE conrelid = 'explore_name_allocations'::regclass AND contype = 'p'",
        );
        expect(rows[0].count).toBe(1);
    });
});

test('keeps old cache writes valid on the expanded schema', async () => {
    const [cachedExplore] = await database('cached_explore')
        .insert({
            project_uuid: projectUuid,
            name: 'legacy_orders',
            table_names: ['legacy_orders'],
            explore: JSON.stringify({ name: 'legacy_orders', tables: {} }),
        })
        .returning('cached_explore_uuid');
    const cachedExploreUuid = cachedExplore.cached_explore_uuid;
    await database('cached_explore')
        .where('cached_explore_uuid', cachedExploreUuid)
        .update({
            explore: JSON.stringify({
                name: 'legacy_orders',
                tables: {},
                label: 'Updated',
            }),
        });
    expect(
        (
            await database('cached_explore')
                .where('cached_explore_uuid', cachedExploreUuid)
                .first()
        )?.name,
    ).toBe('legacy_orders');
    expect(await database('explore_name_allocations')).toEqual([]);
});

test('enforces one project owner per name and one name per owner', async () => {
    await database('explore_name_allocations').insert(allocation('source-a'));
    await expect(
        database('explore_name_allocations').insert(allocation('source-b')),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
        database('explore_name_allocations').insert(
            allocation('source-a', 'source__orders'),
        ),
    ).rejects.toMatchObject({ code: '23505' });
    await database('projects').where('project_uuid', projectUuid).delete();
    expect(await database('explore_name_allocations')).toEqual([]);
});
