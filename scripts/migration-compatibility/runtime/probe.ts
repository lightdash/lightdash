import knex from 'knex';
import { type EncryptionUtil } from '../utils/EncryptionUtil/EncryptionUtil';

const writeResult = process.stdout.write.bind(process.stdout);
process.stdout.write = ((chunk: string | Uint8Array) =>
    process.stderr.write(chunk)) as typeof process.stdout.write;
console.log = (...values: unknown[]) => {
    process.stderr.write(`${values.map(String).join(' ')}\n`);
};

const FINDING_PROJECT_UUID = '10000000-0000-4000-8000-000000000001';
const PROJECT_CREDENTIAL_UUID = '20000000-0000-4000-8000-000000000001';
const CONNECTION_CREDENTIAL_UUID = '20000000-0000-4000-8000-000000000002';
const ARTIFACT_PROJECT_UUID = '10000000-0000-4000-8000-000000000002';
const ARTIFACT_CONNECTION_UUID = '20000000-0000-4000-8000-000000000003';
const TWO_LIVE_PROJECT_UUID = '10000000-0000-4000-8000-000000000003';
const CONNECTION_A_UUID = '30000000-0000-4000-8000-000000000001';
const CONNECTION_B_UUID = '30000000-0000-4000-8000-000000000002';
const SAVED_SQL_UUID = '40000000-0000-4000-8000-000000000001';

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

const createProject = async (
    database: ReturnType<typeof knex>,
    projectUuid: string,
    name: string,
) => {
    const [organization] = await database('organizations')
        .insert({ organization_name: name })
        .returning(['organization_id', 'organization_uuid']);
    const [project] = await database('projects')
        .insert({
            project_uuid: projectUuid,
            slug: name.toLowerCase().replaceAll(' ', '-'),
            name,
            organization_id: organization.organization_id,
            project_type: 'DEFAULT',
            dbt_connection_type: 'none',
            dbt_connection: null,
            copied_from_project_uuid: null,
            dbt_version: 'v1.7',
            created_by_user_uuid: null,
        })
        .returning('project_id');
    return { projectId: project.project_id as number };
};

const model = async (database: ReturnType<typeof knex>) => {
    const { ProjectModel } =
        await import('../models/ProjectModel/ProjectModel');
    return new ProjectModel({
        database,
        lightdashConfig: {} as never,
        encryptionUtil,
    });
};

const findingOneFixture = async (database: ReturnType<typeof knex>) => {
    const [organization] = await database('organizations')
        .insert({ organization_name: 'Migration compatibility finding one' })
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
            project_uuid: FINDING_PROJECT_UUID,
            slug: 'migration-compatibility-finding-one',
            name: 'Migration compatibility finding one',
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
    return { probe: 'finding-one-fixture', status: 'ok' } as const;
};

const findingOneRead = async (database: ReturnType<typeof knex>) => {
    await database('warehouse_credentials')
        .where(
            'project_id',
            database('projects')
                .select('project_id')
                .where({ project_uuid: FINDING_PROJECT_UUID }),
        )
        .update({
            organization_warehouse_credentials_uuid: CONNECTION_CREDENTIAL_UUID,
        });
    const pointers = await database('projects')
        .innerJoin(
            'warehouse_credentials',
            'warehouse_credentials.project_id',
            'projects.project_id',
        )
        .where('projects.project_uuid', FINDING_PROJECT_UUID)
        .first({
            project: 'projects.organization_warehouse_credentials_uuid',
            connection:
                'warehouse_credentials.organization_warehouse_credentials_uuid',
        });
    try {
        const projectModel = await model(database);
        const value =
            await projectModel.getWarehouseCredentialsForProject(
                FINDING_PROJECT_UUID,
            );
        return {
            probe: 'finding-one',
            pointers,
            outcome: {
                kind: 'value',
                credentialMarker: 'host' in value ? value.host : null,
            },
        } as const;
    } catch (error: unknown) {
        const candidate = error as { code?: unknown; message?: unknown };
        const message =
            typeof candidate.message === 'string'
                ? candidate.message
                : String(error);
        const match = /column reference "([^"]+)" is ambiguous/.exec(message);
        return {
            probe: 'finding-one',
            pointers,
            outcome: {
                kind: 'postgres-error',
                code:
                    typeof candidate.code === 'string' ? candidate.code : null,
                column: match?.[1] ?? null,
            },
        } as const;
    }
};

const artifactFixture = async (
    database: ReturnType<typeof knex>,
    kind: 'catalog-cache' | 'merged-manifest',
) => {
    const { projectId } = await createProject(
        database,
        ARTIFACT_PROJECT_UUID,
        `Migration compatibility ${kind}`,
    );
    await database('warehouse_credentials').insert({
        warehouse_credentials_uuid: ARTIFACT_CONNECTION_UUID,
        project_id: projectId,
        warehouse_type: 'postgres',
        name: 'Artifact connection',
        encrypted_credentials: Buffer.from(
            JSON.stringify(credentials('artifact-connection')),
        ),
        organization_warehouse_credentials_uuid: null,
        superseded_at: null,
    });
    if (kind === 'catalog-cache') {
        await database('cached_warehouse').insert({
            project_uuid: ARTIFACT_PROJECT_UUID,
            warehouse: JSON.stringify({ marker: 'new-before-old' }),
        });
        await database('project_connection_catalog_cache').insert({
            project_uuid: ARTIFACT_PROJECT_UUID,
            connection_uuid: ARTIFACT_CONNECTION_UUID,
            warehouse: JSON.stringify({ marker: 'new-before-old' }),
        });
    } else {
        await database('project_merged_manifests').insert({
            project_uuid: ARTIFACT_PROJECT_UUID,
            manifest: Buffer.from('new-before-old'),
        });
        await database('project_connection_manifests').insert({
            project_uuid: ARTIFACT_PROJECT_UUID,
            connection_uuid: ARTIFACT_CONNECTION_UUID,
            manifest: Buffer.from('new-before-old'),
        });
    }
    return { probe: `${kind}-fixture`, status: 'ok' } as const;
};

const artifactWrite = async (
    database: ReturnType<typeof knex>,
    kind: 'catalog-cache' | 'merged-manifest',
) => {
    if (kind === 'catalog-cache') {
        const projectModel = await model(database);
        await projectModel.saveWarehouseToCache(ARTIFACT_PROJECT_UUID, {
            marker: 'old-latest',
        } as never);
    } else {
        const projectModel = await model(database);
        await projectModel.upsertMergedManifest(
            ARTIFACT_PROJECT_UUID,
            Buffer.from('old-latest'),
        );
    }
    return { probe: `${kind}-write`, status: 'ok' } as const;
};

const artifactRead = async (
    database: ReturnType<typeof knex>,
    kind: 'catalog-cache' | 'merged-manifest',
) => {
    if (kind === 'catalog-cache') {
        const legacy = await database('cached_warehouse')
            .where('project_uuid', ARTIFACT_PROJECT_UUID)
            .first('warehouse');
        const scoped = await database('project_connection_catalog_cache')
            .where({
                project_uuid: ARTIFACT_PROJECT_UUID,
                connection_uuid: ARTIFACT_CONNECTION_UUID,
            })
            .first('warehouse');
        const projectModel = await model(database);
        const observed = await projectModel.getWarehouseFromCache(
            ARTIFACT_PROJECT_UUID,
            ARTIFACT_CONNECTION_UUID,
        );
        return {
            probe: kind,
            values: {
                legacy: legacy?.warehouse?.marker ?? null,
                scoped: scoped?.warehouse?.marker ?? null,
                observed:
                    observed && 'marker' in observed
                        ? (observed.marker as string)
                        : null,
            },
        } as const;
    }
    const legacy = await database('project_merged_manifests')
        .where('project_uuid', ARTIFACT_PROJECT_UUID)
        .first('manifest');
    const scoped = await database('project_connection_manifests')
        .where({
            project_uuid: ARTIFACT_PROJECT_UUID,
            connection_uuid: ARTIFACT_CONNECTION_UUID,
        })
        .first('manifest');
    const projectModel = await model(database);
    const observed = await projectModel.getMergedManifest(
        ARTIFACT_PROJECT_UUID,
        ARTIFACT_CONNECTION_UUID,
    );
    return {
        probe: kind,
        values: {
            legacy:
                (legacy?.manifest as Buffer | undefined)?.toString() ?? null,
            scoped:
                (scoped?.manifest as Buffer | undefined)?.toString() ?? null,
            observed: observed.toString(),
        },
    } as const;
};

const twoLiveFixture = async (database: ReturnType<typeof knex>) => {
    const { projectId } = await createProject(
        database,
        TWO_LIVE_PROJECT_UUID,
        'Migration compatibility two live connections',
    );
    await database('warehouse_credentials').insert([
        {
            warehouse_credentials_uuid: CONNECTION_A_UUID,
            project_id: projectId,
            warehouse_type: 'postgres',
            name: 'Connection A',
            encrypted_credentials: Buffer.from(
                JSON.stringify(credentials('connection-a')),
            ),
            organization_warehouse_credentials_uuid: null,
            superseded_at: null,
        },
        {
            warehouse_credentials_uuid: CONNECTION_B_UUID,
            project_id: projectId,
            warehouse_type: 'postgres',
            name: 'Connection B',
            encrypted_credentials: Buffer.from(
                JSON.stringify(credentials('connection-b')),
            ),
            organization_warehouse_credentials_uuid: null,
            superseded_at: null,
        },
    ]);
    await database('saved_sql').insert({
        saved_sql_uuid: SAVED_SQL_UUID,
        project_uuid: TWO_LIVE_PROJECT_UUID,
        name: 'Bound to connection B',
        slug: 'bound-to-connection-b',
    });
    await database('saved_sql_versions').insert({
        saved_sql_uuid: SAVED_SQL_UUID,
        sql: 'select 1',
        connection_uuid: CONNECTION_B_UUID,
    });
    return { probe: 'two-live-connections-fixture', status: 'ok' } as const;
};

const twoLiveRead = async (database: ReturnType<typeof knex>) => {
    await database.raw('SET enable_indexscan = off');
    await database.raw('SET enable_bitmapscan = off');
    const rows = await database('warehouse_credentials')
        .whereNull('superseded_at')
        .where({
            project_id: database('projects')
                .select('project_id')
                .where({ project_uuid: TWO_LIVE_PROJECT_UUID }),
        })
        .orderBy('warehouse_credentials_id')
        .select('warehouse_credentials_uuid', 'encrypted_credentials');
    const binding = await database('saved_sql_versions')
        .where('saved_sql_uuid', SAVED_SQL_UUID)
        .first('connection_uuid');
    const available = rows.map((row) => ({
        connectionUuid: row.warehouse_credentials_uuid as string,
        credentialMarker: JSON.parse(
            encryptionUtil.decrypt(row.encrypted_credentials as Buffer),
        ).host as string,
    }));
    let outcome;
    try {
        const projectModel = await model(database);
        const value = await projectModel.getWarehouseCredentialsForProject(
            TWO_LIVE_PROJECT_UUID,
        );
        const selectedMarker = 'host' in value ? value.host : null;
        const selected = available.find(
            ({ credentialMarker }) => credentialMarker === selectedMarker,
        );
        outcome = selected ? { kind: 'selected', ...selected } : null;
    } catch (error: unknown) {
        const candidate = error as { message?: unknown; name?: unknown };
        outcome = {
            kind: 'refused',
            name: typeof candidate.name === 'string' ? candidate.name : null,
            message:
                typeof candidate.message === 'string'
                    ? candidate.message
                    : String(error),
        };
    }
    return {
        probe: 'two-live-connections',
        values: {
            available,
            contentBinding: binding?.connection_uuid ?? null,
            outcome,
        },
    } as const;
};

const main = async () => {
    const database = knex({
        client: 'pg',
        connection: requireConnectionUri(),
        pool: { min: 0, max: 1 },
    });
    try {
        const [command, kind] = process.argv.slice(2);
        if (command === 'finding-one-fixture') {
            return await findingOneFixture(database);
        }
        if (command === 'finding-one-read') {
            return await findingOneRead(database);
        }
        if (
            (command === 'artifact-fixture' ||
                command === 'artifact-write' ||
                command === 'artifact-read') &&
            (kind === 'catalog-cache' || kind === 'merged-manifest')
        ) {
            if (command === 'artifact-fixture') {
                return await artifactFixture(database, kind);
            }
            if (command === 'artifact-write') {
                return await artifactWrite(database, kind);
            }
            return await artifactRead(database, kind);
        }
        if (command === 'two-live-fixture') {
            return await twoLiveFixture(database);
        }
        if (command === 'two-live-read') {
            return await twoLiveRead(database);
        }
        throw new Error(`Unknown probe command: ${command ?? ''}`);
    } finally {
        await database.destroy();
    }
};

main()
    .then((result) => writeResult(`${JSON.stringify(result)}\n`))
    .catch((error: unknown) => {
        process.stderr.write(
            `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
        );
        process.exitCode = 1;
    });
