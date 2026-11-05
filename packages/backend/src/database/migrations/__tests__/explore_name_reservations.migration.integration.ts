import { ProjectType, SupportedDbtVersions } from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { down, up } from '../20261021180000_add_explore_name_reservations';

let migrated: MigratedDatabase;
let database: Knex;
let projectUuid: string;

beforeAll(async () => {
    migrated = await createMigratedDatabase();
    database = migrated.database;
    const [organization] = await database('organizations')
        .insert({ organization_name: 'Explore reservation fixture' })
        .returning('organization_id');
    const [project] = await database('projects')
        .insert({
            name: 'Explore reservation fixture',
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

beforeEach(async () => {
    await database('explore_name_allocations')
        .where('project_uuid', projectUuid)
        .delete();
});

afterAll(async () => migrated?.destroy());

const allocation = (name: string) => ({
    project_uuid: projectUuid,
    name,
    source_key: randomUUID(),
    source_name: 'source',
    package_name: 'package',
    model_unique_id: `model.package.${name}`,
    model_name: name,
});

const reservation = (name: string) => ({
    project_uuid: projectUuid,
    name,
    source_key: '__reserved__',
    source_name: null,
    package_name: '__reserved__',
    model_unique_id: '__reserved__',
    model_name: name,
    is_reserved: true,
});

test('adds a false default for existing owners and keeps the old insert shape valid', async () => {
    await database.transaction(async (trx) => {
        await down(trx);
        await trx('explore_name_allocations').insert(allocation('orders'));
        await up(trx);
        await trx('explore_name_allocations').insert(allocation('accounts'));
        expect(
            await trx('explore_name_allocations')
                .select('name', 'is_reserved')
                .where('project_uuid', projectUuid)
                .orderBy('name'),
        ).toEqual([
            { name: 'accounts', is_reserved: false },
            { name: 'orders', is_reserved: false },
        ]);
    });
});

test('removes reservations on rollback while preserving real owners', async () => {
    await database.transaction(async (trx) => {
        const owner = allocation('source__orders');
        await trx('explore_name_allocations').insert(owner);
        await trx('explore_name_allocations').insert(reservation('orders'));
        await down(trx);
        expect(
            await trx.schema.hasColumn(
                'explore_name_allocations',
                'is_reserved',
            ),
        ).toBe(false);
        expect(
            await trx('explore_name_allocations')
                .where('project_uuid', projectUuid)
                .select('*'),
        ).toEqual([
            {
                ...owner,
                explore_name_allocation_uuid: expect.any(String),
            },
        ]);
        await up(trx);
        expect(
            await trx('explore_name_allocations')
                .where('project_uuid', projectUuid)
                .select('name', 'is_reserved'),
        ).toEqual([{ name: 'source__orders', is_reserved: false }]);
    });
});

test('blocks old writers from taking a reserved name', async () => {
    await database('explore_name_allocations').insert(reservation('orders'));
    await expect(
        database('explore_name_allocations').insert(allocation('orders')),
    ).rejects.toMatchObject({ code: '23505' });
    expect(
        await database('explore_name_allocations')
            .where({ project_uuid: projectUuid, name: 'orders' })
            .select('source_key', 'is_reserved'),
    ).toEqual([{ source_key: '__reserved__', is_reserved: true }]);
});

test('supports multiple reservations without treating them as the same owner', async () => {
    await database('explore_name_allocations').insert([
        reservation('orders'),
        reservation('accounts'),
    ]);
    expect(
        await database('explore_name_allocations')
            .where({ project_uuid: projectUuid, is_reserved: true })
            .select('name')
            .orderBy('name'),
    ).toEqual([{ name: 'accounts' }, { name: 'orders' }]);
});

test('requires a reservation flag on every row', async () => {
    await expect(
        database.raw(
            'INSERT INTO explore_name_allocations (project_uuid, name, source_key, source_name, package_name, model_unique_id, model_name, is_reserved) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)',
            Object.values(allocation('orders')),
        ),
    ).rejects.toMatchObject({ code: '23502' });
});
