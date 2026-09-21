import knex from 'knex';
import { ProjectModel } from '../models/ProjectModel/ProjectModel';
import { type EncryptionUtil } from '../utils/EncryptionUtil/EncryptionUtil';

const PROJECT_UUID = '10000000-0000-4000-8000-000000000001';
const PROJECT_CREDENTIAL_UUID = '20000000-0000-4000-8000-000000000001';
const CONNECTION_CREDENTIAL_UUID = '20000000-0000-4000-8000-000000000002';

const requireConnectionUri = (): string => {
    const value = process.env.PGCONNECTIONURI;
    if (!value) throw new Error('PGCONNECTIONURI is required');
    return value;
};

const credentials = (host: string) => ({
    type: 'postgres',
    host,
    port: 5432,
    user: 'compatibility',
    password: 'compatibility',
    dbname: 'compatibility',
    schema: 'public',
    sslmode: 'disable',
});

const encryptionUtil = {
    encrypt: (value: string) => Buffer.from(value),
    decrypt: (value: Buffer) => value.toString(),
} as unknown as EncryptionUtil;

const fixture = async (database: ReturnType<typeof knex>) => {
    const [organization] = await database('organizations')
        .insert({ organization_name: 'Migration compatibility' })
        .returning(['organization_id', 'organization_uuid']);
    await database('organization_warehouse_credentials').insert([
        {
            organization_warehouse_credentials_uuid: PROJECT_CREDENTIAL_UUID,
            organization_uuid: organization.organization_uuid,
            name: 'Project authority',
            warehouse_type: 'postgres',
            warehouse_connection: Buffer.from(
                JSON.stringify(credentials('project-authority')),
            ),
        },
        {
            organization_warehouse_credentials_uuid: CONNECTION_CREDENTIAL_UUID,
            organization_uuid: organization.organization_uuid,
            name: 'Connection copy',
            warehouse_type: 'postgres',
            warehouse_connection: Buffer.from(
                JSON.stringify(credentials('connection-copy')),
            ),
        },
    ]);
    const [project] = await database('projects')
        .insert({
            project_uuid: PROJECT_UUID,
            slug: 'migration-compatibility',
            name: 'Migration compatibility',
            organization_id: organization.organization_id,
            project_type: 'DEFAULT',
            dbt_connection_type: 'none',
            dbt_connection: null,
            copied_from_project_uuid: null,
            dbt_version: 'v1.7',
            created_by_user_uuid: null,
            organization_warehouse_credentials_uuid: PROJECT_CREDENTIAL_UUID,
        })
        .returning('project_id');
    await database('warehouse_credentials').insert({
        project_id: project.project_id,
        warehouse_type: 'postgres',
        encrypted_credentials: Buffer.from(
            JSON.stringify(credentials('project-row')),
        ),
    });
    return {
        probe: 'finding-1-fixture',
        status: 'ok',
        projectUuid: PROJECT_UUID,
        projectCredentialUuid: PROJECT_CREDENTIAL_UUID,
    } as const;
};

const read = async (database: ReturnType<typeof knex>) => {
    await database('warehouse_credentials')
        .where('project_id', database('projects').select('project_id').where({ project_uuid: PROJECT_UUID }))
        .update({
            organization_warehouse_credentials_uuid: CONNECTION_CREDENTIAL_UUID,
        });
    const pointers = await database('projects')
        .innerJoin(
            'warehouse_credentials',
            'warehouse_credentials.project_id',
            'projects.project_id',
        )
        .where('projects.project_uuid', PROJECT_UUID)
        .first({
            project: 'projects.organization_warehouse_credentials_uuid',
            connection:
                'warehouse_credentials.organization_warehouse_credentials_uuid',
        });
    const model = new ProjectModel({
        database,
        lightdashConfig: {} as never,
        encryptionUtil,
    });
    try {
        const value = await model.getWarehouseCredentialsForProject(PROJECT_UUID);
        return {
            probe: 'finding-1-read',
            status: 'ok',
            pointers,
            outcome: {
                kind: 'value',
                credentialMarker: 'host' in value ? value.host : null,
            },
        } as const;
    } catch (error: unknown) {
        const candidate = error as {
            code?: unknown;
            message?: unknown;
        };
        const message =
            typeof candidate.message === 'string' ? candidate.message : String(error);
        const match = /column reference "([^"]+)" is ambiguous/.exec(message);
        return {
            probe: 'finding-1-read',
            status: 'ok',
            pointers,
            outcome: {
                kind: 'postgres-error',
                code: typeof candidate.code === 'string' ? candidate.code : null,
                column: match?.[1] ?? null,
            },
        } as const;
    }
};

const main = async () => {
    const database = knex({
        client: 'pg',
        connection: requireConnectionUri(),
        pool: { min: 0, max: 2 },
    });
    try {
        if (process.argv[2] === 'fixture') return fixture(database);
        if (process.argv[2] === 'read') return read(database);
        throw new Error(`Unknown probe command: ${process.argv[2] ?? ''}`);
    } finally {
        await database.destroy();
    }
};

main()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error: unknown) => {
        process.stderr.write(
            `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
        );
        process.exitCode = 1;
    });
