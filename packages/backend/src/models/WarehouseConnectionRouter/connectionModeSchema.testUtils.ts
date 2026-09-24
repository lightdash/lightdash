import {
    DbtProjectType,
    DbtVersionOptionLatest,
    ProjectType,
    WarehouseTypes,
    type CreatePostgresCredentials,
} from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { type EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';

export const connectionModeTestDatabaseUri = () => {
    const url = new URL(process.env.PGCONNECTIONURI ?? '');
    url.pathname = `${url.pathname.replace(/^\//, '') || 'lightdash'}_test`;
    return url.toString();
};

export const routingTestCredentials: CreatePostgresCredentials = {
    type: WarehouseTypes.POSTGRES,
    host: 'warehouse.internal',
    user: 'analyst',
    password: 'analyst-password',
    port: 5432,
    dbname: 'analytics',
    schema: 'public',
    requireUserCredentials: false,
};

export const withProjectsCopy = async (
    projectUuid: string,
    alterStatements: string[],
    run: (database: Knex) => Promise<void>,
    connection: Knex.StaticConnectionConfig = {
        connectionString: connectionModeTestDatabaseUri(),
    },
) => {
    const schema = `routing_projects_copy_${process.pid}_${Date.now()}`;
    const database = knex({
        client: 'pg',
        connection,
        searchPath: [schema, 'public'],
        pool: { min: 0, max: 1 },
    });
    try {
        await database.raw('CREATE SCHEMA ??', [schema]);
        await database.raw(
            'CREATE TABLE ??.projects (LIKE public.projects INCLUDING ALL)',
            [schema],
        );
        await database.raw(
            'INSERT INTO ??.projects OVERRIDING SYSTEM VALUE SELECT * FROM public.projects WHERE project_uuid = ?',
            [schema, projectUuid],
        );
        await alterStatements.reduce<Promise<unknown>>(
            (previous, statement) =>
                previous.then(() =>
                    database.raw(
                        statement.replaceAll(':schema', `"${schema}"`),
                    ),
                ),
            Promise.resolve(),
        );
        await run(database);
    } finally {
        await database.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]);
        await database.destroy();
    }
};

export const withProjectsWithoutConnectionMode = (
    projectUuid: string,
    run: (database: Knex) => Promise<void>,
    connection?: Knex.StaticConnectionConfig,
) =>
    withProjectsCopy(
        projectUuid,
        ['ALTER TABLE :schema.projects DROP COLUMN connection_mode'],
        run,
        connection,
    );

export const insertRoutingTestProject = async (
    database: Knex,
    encryptionUtil: EncryptionUtil,
) => {
    const [organization] = await database('organizations')
        .insert({ organization_name: 'Routing test organisation' })
        .returning('organization_id');
    const [project] = await database('projects')
        .insert({
            name: 'Routing test project',
            project_type: ProjectType.DEFAULT,
            organization_id: organization.organization_id,
            organization_warehouse_credentials_uuid: null,
            copied_from_project_uuid: null,
            created_by_user_uuid: null,
            dbt_version: DbtVersionOptionLatest.LATEST,
            dbt_connection_type: DbtProjectType.NONE,
            dbt_connection: encryptionUtil.encrypt(
                JSON.stringify({ type: 'none' }),
            ),
        })
        .returning(['project_id', 'project_uuid']);
    await database('warehouse_credentials').insert({
        project_id: project.project_id,
        warehouse_type: WarehouseTypes.POSTGRES,
        encrypted_credentials: encryptionUtil.encrypt(
            JSON.stringify(routingTestCredentials),
        ),
    });
    return {
        organizationId: organization.organization_id as number,
        projectUuid: project.project_uuid as string,
    };
};

export const setProjectRoutesMulti = async (
    database: Knex,
    projectUuid: string,
    connections: { name: string; isOriginal: boolean }[],
) => {
    await database.raw(
        `UPDATE projects SET connection_mode = 'multi' WHERE project_uuid = ?`,
        [projectUuid],
    );
    if (connections.length === 0) return;
    await database('warehouse_connections').insert(
        connections.map(({ name, isOriginal }) =>
            isOriginal
                ? { project_uuid: projectUuid, is_original: true, name }
                : {
                      project_uuid: projectUuid,
                      is_original: false,
                      name,
                      warehouse_type: WarehouseTypes.POSTGRES,
                      encrypted_credentials: Buffer.from('extra-ciphertext'),
                  },
        ),
    );
};

export const inRolledBackTransaction = async (
    database: Knex,
    run: (transaction: Knex.Transaction) => Promise<void>,
) => {
    const transaction = await database.transaction();
    try {
        await run(transaction);
    } finally {
        await transaction.rollback();
    }
};
