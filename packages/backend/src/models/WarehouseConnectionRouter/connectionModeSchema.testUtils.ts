import {
    DbtProjectType,
    DbtVersionOptionLatest,
    ProjectType,
    WarehouseTypes,
    type CreatePostgresCredentials,
} from '@lightdash/common';
import { type Knex } from 'knex';
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

export const createStandInConnectionModeSchema = async (database: Knex) => {
    await database.raw(
        `ALTER TABLE projects ADD COLUMN connection_mode text NOT NULL DEFAULT 'single' CHECK (connection_mode IN ('single', 'multi'))`,
    );
    await database.raw(
        `CREATE TABLE warehouse_connections (
            warehouse_connection_uuid uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            project_uuid uuid NOT NULL REFERENCES projects (project_uuid) ON DELETE CASCADE,
            is_original boolean NOT NULL,
            name text NOT NULL
        )`,
    );
};

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
        connections.map(({ name, isOriginal }) => ({
            project_uuid: projectUuid,
            is_original: isOriginal,
            name,
        })),
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
