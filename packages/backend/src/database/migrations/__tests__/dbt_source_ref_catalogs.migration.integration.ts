import { DbtProjectType, ProjectType } from '@lightdash/common';
import { randomUUID } from 'crypto';
import { DbtSourceRefCatalogModel } from '../../../models/DbtSourceRefCatalogModel';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { down, up } from '../20261020154000_add_dbt_source_ref_catalogs';

let migrated: MigratedDatabase;
let projectUuid: string;
let organizationId: number;
let model: DbtSourceRefCatalogModel;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
    const [org] = await migrated
        .database('organizations')
        .insert({ organization_name: 'Ref catalogue fixture' })
        .returning('organization_id');
    organizationId = org.organization_id;
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
beforeEach(async () => {
    await migrated.database('dbt_source_ref_catalogs').delete();
});

const insertProjectName = (
    dbtSourceUuid: string,
    connectionGroup = 'original',
    projectName = 'provider',
    fixtureProjectUuid = projectUuid,
) =>
    migrated.database('dbt_source_ref_catalogs').insert({
        project_uuid: fixtureProjectUuid,
        dbt_source_uuid: dbtSourceUuid,
        connection_group: connectionGroup,
        project_name: projectName,
        dbt_version: 'v1.9',
        status: 'confirmed',
        nodes: '[]',
        nodes_digest: 'existing-catalog-fixture',
        compile_job_uuid: null,
    });

test('creates the catalogue on the real schema and reverses the migration', async () => {
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

test('reads source project names across connection groups for only the requested project', async () => {
    const first = randomUUID();
    const second = randomUUID();
    const [other] = await migrated
        .database('projects')
        .insert({
            name: 'Other catalogue fixture',
            organization_id: organizationId,
            project_type: ProjectType.DEFAULT,
            dbt_connection_type: DbtProjectType.NONE,
            dbt_connection: null,
            copied_from_project_uuid: null,
            dbt_version: 'v1.9',
            created_by_user_uuid: null,
            organization_warehouse_credentials_uuid: null,
        })
        .returning('project_uuid');
    await insertProjectName(first);
    await insertProjectName(second, 'extra', 'finance');
    await insertProjectName(
        randomUUID(),
        'original',
        'other',
        other.project_uuid,
    );

    const names = await model.getProjectNames(projectUuid);
    expect(names).toEqual(
        expect.arrayContaining([
            { dbt_source_uuid: first, project_name: 'provider' },
            { dbt_source_uuid: second, project_name: 'finance' },
        ]),
    );
    expect(names).toHaveLength(2);
    expect(await model.getProjectNames(randomUUID())).toEqual([]);
});

test('cascades cache rows when their project is removed', async () => {
    await insertProjectName(randomUUID());
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
    await insertProjectName(source);
    const row = await migrated
        .database('dbt_source_ref_catalogs')
        .where({ project_uuid: projectUuid, dbt_source_uuid: source })
        .first();
    expect(row?.referenced_projects).toEqual([]);
    await expect(
        migrated.database.raw(
            'UPDATE dbt_source_ref_catalogs SET referenced_projects = NULL WHERE dbt_source_uuid = ?',
            [source],
        ),
    ).rejects.toMatchObject({ code: '23502' });
});
