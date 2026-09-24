import knex, { type Knex } from 'knex';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { getAdminDatabase } from '../../../testing/migratedDatabase';

type Migration = {
    up: (database: Knex) => Promise<void>;
    down: (database: Knex) => Promise<void>;
};

type ColumnName = { table: string; column: string };

const MIGRATION_NAMES = [
    '20260923200000_add_connection_mode_to_projects',
    '20260923200100_create_warehouse_connections',
    '20260923200200_add_warehouse_connection_bindings',
] as const;

const NEW_TABLES = [
    'warehouse_connections',
    'warehouse_connection_user_credentials_preference',
    'warehouse_connection_tables',
    'warehouse_connection_manifests',
    'warehouse_connection_catalog_cache',
    'project_connection_mode_events',
];

const BOUND_TABLES = [
    'cached_explore',
    'cached_explore_staging',
    'project_dbt_sources',
    'saved_sql_versions',
    'query_history',
];

const loadMigration = async (name: string): Promise<Migration> =>
    import(`../${name}.ts`);

const connectionSettings = () => ({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT ?? 5432),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
});

const findReusedColumnNames = (
    before: ColumnName[],
    after: ColumnName[],
    newTables: string[],
): ColumnName[] => {
    const beforeKeys = new Set(
        before.map(({ table, column }) => `${table}.${column}`),
    );
    const beforeNames = new Set(before.map(({ column }) => column));
    return after.filter(
        ({ table, column }) =>
            !beforeKeys.has(`${table}.${column}`) &&
            !newTables.includes(table) &&
            beforeNames.has(column),
    );
};

describe('findReusedColumnNames', () => {
    test('flags a column added to an existing table under a name another table already uses', () => {
        expect(
            findReusedColumnNames(
                [
                    { table: 'projects', column: 'name' },
                    { table: 'warehouse_credentials', column: 'project_id' },
                ],
                [
                    { table: 'projects', column: 'name' },
                    { table: 'warehouse_credentials', column: 'project_id' },
                    { table: 'warehouse_credentials', column: 'name' },
                ],
                [],
            ),
        ).toEqual([{ table: 'warehouse_credentials', column: 'name' }]);
    });

    test('allows a new table to reuse common column names', () => {
        expect(
            findReusedColumnNames(
                [{ table: 'projects', column: 'project_uuid' }],
                [
                    { table: 'projects', column: 'project_uuid' },
                    { table: 'warehouse_connections', column: 'project_uuid' },
                ],
                ['warehouse_connections'],
            ),
        ).toEqual([]);
    });
});

describe('warehouse connection mode schema on every migration', () => {
    let admin: Knex;
    let database: Knex;
    let databaseName: string;

    const rows = async <T>(sql: string, bindings: unknown[] = []) =>
        (await database.raw<{ rows: T[] }>(sql, bindings)).rows;

    const one = async <T>(sql: string, bindings: unknown[] = []) =>
        (await rows<T>(sql, bindings))[0];

    const columnNames = () =>
        rows<ColumnName>(
            `SELECT table_name AS table, column_name AS column
             FROM information_schema.columns
             WHERE table_schema = 'public'`,
        );

    const createOrganization = () =>
        one<{ organization_id: number; organization_uuid: string }>(
            `INSERT INTO organizations (organization_name) VALUES ('Connection mode test')
             RETURNING organization_id, organization_uuid`,
        );

    const createUser = async () =>
        (
            await one<{ user_uuid: string }>(
                `INSERT INTO users (first_name, last_name) VALUES ('Test', 'User') RETURNING user_uuid`,
            )
        ).user_uuid;

    const createProject = (organizationId: number) =>
        one<{ project_id: number; project_uuid: string }>(
            `INSERT INTO projects (name, organization_id) VALUES ('Connection mode project', ?)
             RETURNING project_id, project_uuid`,
            [organizationId],
        );

    const insertConnection = async (
        projectUuid: string,
        values: {
            isOriginal: boolean;
            name?: string;
            warehouseType?: string | null;
            encryptedCredentials?: Buffer | null;
            organizationWarehouseCredentialsUuid?: string | null;
        },
        connection: Knex | Knex.Transaction = database,
    ) =>
        (
            await connection.raw<{
                rows: { warehouse_connection_uuid: string }[];
            }>(
                `INSERT INTO warehouse_connections
                    (project_uuid, is_original, name, warehouse_type, encrypted_credentials, organization_warehouse_credentials_uuid)
                 VALUES (?, ?, ?, ?, ?, ?)
                 RETURNING warehouse_connection_uuid`,
                [
                    projectUuid,
                    values.isOriginal,
                    values.name ?? `Connection ${randomUUID()}`.slice(0, 40),
                    values.warehouseType ?? null,
                    values.encryptedCredentials ?? null,
                    values.organizationWarehouseCredentialsUuid ?? null,
                ],
            )
        ).rows[0].warehouse_connection_uuid;

    const insertExtraConnection = (projectUuid: string) =>
        insertConnection(projectUuid, {
            isOriginal: false,
            warehouseType: 'postgres',
            encryptedCredentials: Buffer.from('ciphertext'),
        });

    const createOrganizationCredential = async (organizationUuid: string) =>
        (
            await one<{ organization_warehouse_credentials_uuid: string }>(
                `INSERT INTO organization_warehouse_credentials
                    (organization_uuid, name, warehouse_type, warehouse_connection)
                 VALUES (?, 'Shared', 'postgres', ?)
                 RETURNING organization_warehouse_credentials_uuid`,
                [organizationUuid, Buffer.from('ciphertext')],
            )
        ).organization_warehouse_credentials_uuid;

    const bindEverything = async ({
        organizationUuid,
        projectUuid,
        userUuid,
        warehouseConnectionUuid,
    }: {
        organizationUuid: string;
        projectUuid: string;
        userUuid: string;
        warehouseConnectionUuid: string;
    }) => {
        await database.raw(
            `INSERT INTO cached_explore (project_uuid, name, table_names, explore, warehouse_connection_uuid)
             VALUES (?, ?, '{}', '{}', ?)`,
            [projectUuid, `explore_${randomUUID()}`, warehouseConnectionUuid],
        );
        await database.raw(
            `INSERT INTO cached_explore_staging (save_uuid, project_uuid, name, table_names, explore, warehouse_connection_uuid)
             VALUES (?, ?, 'staged', '{}', '{}', ?)`,
            [randomUUID(), projectUuid, warehouseConnectionUuid],
        );
        await database.raw(
            `INSERT INTO project_dbt_sources (project_uuid, name, warehouse_connection_uuid)
             VALUES (?, ?, ?)`,
            [projectUuid, `source_${randomUUID()}`, warehouseConnectionUuid],
        );
        const { saved_sql_uuid: savedSqlUuid } = await one<{
            saved_sql_uuid: string;
        }>(
            `INSERT INTO saved_sql (project_uuid, name, slug) VALUES (?, 'SQL chart', ?)
             RETURNING saved_sql_uuid`,
            [projectUuid, `sql-chart-${randomUUID()}`],
        );
        await database.raw(
            `INSERT INTO saved_sql_versions (saved_sql_uuid, sql, warehouse_connection_uuid)
             VALUES (?, 'select 1', ?)`,
            [savedSqlUuid, warehouseConnectionUuid],
        );
        await database.raw(
            `INSERT INTO query_history
                (organization_uuid, project_uuid, context, compiled_sql, metric_query, fields, request_parameters, cache_key, status, warehouse_connection_uuid)
             VALUES (?, ?, 'test', 'select 1', '{}', '{}', '{}', ?, 'executing', ?)`,
            [
                organizationUuid,
                projectUuid,
                randomUUID(),
                warehouseConnectionUuid,
            ],
        );
        const { user_warehouse_credentials_uuid: userCredentialsUuid } =
            await one<{ user_warehouse_credentials_uuid: string }>(
                `INSERT INTO user_warehouse_credentials (user_uuid, name, warehouse_type, encrypted_credentials)
                 VALUES (?, 'Personal', 'postgres', ?)
                 RETURNING user_warehouse_credentials_uuid`,
                [userUuid, Buffer.from('ciphertext')],
            );
        await database.raw(
            `INSERT INTO warehouse_connection_user_credentials_preference
                (user_uuid, warehouse_connection_uuid, user_warehouse_credentials_uuid)
             VALUES (?, ?, ?)`,
            [userUuid, warehouseConnectionUuid, userCredentialsUuid],
        );
        await database.raw(
            `INSERT INTO warehouse_connection_tables
                (warehouse_connection_uuid, user_warehouse_credentials_uuid, listed_database, database, schema, "table")
             VALUES (?, ?, 'analytics', 'analytics', 'public', 'orders')`,
            [warehouseConnectionUuid, userCredentialsUuid],
        );
        await database.raw(
            `INSERT INTO warehouse_connection_manifests (warehouse_connection_uuid, manifest) VALUES (?, ?)`,
            [warehouseConnectionUuid, Buffer.from('manifest')],
        );
        await database.raw(
            `INSERT INTO warehouse_connection_catalog_cache (warehouse_connection_uuid, warehouse) VALUES (?, '{}')`,
            [warehouseConnectionUuid],
        );
        await database.raw(
            `INSERT INTO project_connection_mode_events
                (project_uuid, actor_user_uuid, event, plan, plan_hash, idempotency_key)
             VALUES (?, ?, 'connection_added', '{}', 'plan-hash', ?)`,
            [projectUuid, userUuid, randomUUID()],
        );
    };

    const createBoundProject = async () => {
        const organization = await createOrganization();
        const userUuid = await createUser();
        const project = await createProject(organization.organization_id);
        await insertConnection(project.project_uuid, { isOriginal: true });
        const organizationWarehouseCredentialsUuid =
            await createOrganizationCredential(organization.organization_uuid);
        const warehouseConnectionUuid = await insertConnection(
            project.project_uuid,
            {
                isOriginal: false,
                warehouseType: 'postgres',
                organizationWarehouseCredentialsUuid,
            },
        );
        await database.raw(
            `UPDATE projects SET connection_mode = 'multi' WHERE project_uuid = ?`,
            [project.project_uuid],
        );
        await bindEverything({
            organizationUuid: organization.organization_uuid,
            projectUuid: project.project_uuid,
            userUuid,
            warehouseConnectionUuid,
        });
        return {
            organization,
            project,
            userUuid,
            warehouseConnectionUuid,
        };
    };

    const countProjectRows = async (projectUuid: string) => {
        const counts = await one<Record<string, number>>(
            `SELECT
                (SELECT count(*)::int FROM warehouse_connections WHERE project_uuid = ?) AS warehouse_connections,
                (SELECT count(*)::int FROM cached_explore WHERE project_uuid = ?) AS cached_explore,
                (SELECT count(*)::int FROM cached_explore_staging WHERE project_uuid = ?) AS cached_explore_staging,
                (SELECT count(*)::int FROM project_dbt_sources WHERE project_uuid = ?) AS project_dbt_sources,
                (SELECT count(*)::int FROM saved_sql WHERE project_uuid = ?) AS saved_sql,
                (SELECT count(*)::int FROM project_connection_mode_events WHERE project_uuid = ?) AS events`,
            Array(6).fill(projectUuid),
        );
        return counts;
    };

    const countConnectionRows = (warehouseConnectionUuid: string) =>
        one<Record<string, number>>(
            `SELECT
                (SELECT count(*)::int FROM warehouse_connection_user_credentials_preference WHERE warehouse_connection_uuid = ?) AS preferences,
                (SELECT count(*)::int FROM warehouse_connection_tables WHERE warehouse_connection_uuid = ?) AS tables,
                (SELECT count(*)::int FROM warehouse_connection_manifests WHERE warehouse_connection_uuid = ?) AS manifests,
                (SELECT count(*)::int FROM warehouse_connection_catalog_cache WHERE warehouse_connection_uuid = ?) AS catalog_cache,
                (SELECT count(*)::int FROM saved_sql_versions WHERE warehouse_connection_uuid = ?) AS saved_sql_versions`,
            Array(5).fill(warehouseConnectionUuid),
        );

    beforeAll(async () => {
        const adminDatabase = getAdminDatabase();
        databaseName = `connection_modes_${randomUUID().replaceAll('-', '')}`;
        admin = knex({
            client: 'pg',
            connection: { ...connectionSettings(), database: adminDatabase },
        });
        await admin.raw('CREATE DATABASE ??', [databaseName]);
        const settings = connectionSettings();
        execFileSync('pnpm', ['migrate'], {
            cwd: process.cwd(),
            env: {
                ...process.env,
                PGCONNECTIONURI: `postgres://${encodeURIComponent(
                    settings.user ?? '',
                )}:${encodeURIComponent(settings.password ?? '')}@${
                    settings.host
                }:${settings.port}/${databaseName}`,
            },
            stdio: 'pipe',
        });
        database = knex({
            client: 'pg',
            connection: { ...connectionSettings(), database: databaseName },
            pool: { min: 0, max: 4 },
        });
    }, 600000);

    afterAll(async () => {
        await database?.destroy();
        await admin?.raw('DROP DATABASE IF EXISTS ?? WITH (FORCE)', [
            databaseName,
        ]);
        await admin?.destroy();
    });

    describe('projects.connection_mode', () => {
        test('defaults every new project to single', async () => {
            const organization = await createOrganization();
            const project = await createProject(organization.organization_id);

            expect(
                await one(
                    `SELECT connection_mode FROM projects WHERE project_uuid = ?`,
                    [project.project_uuid],
                ),
            ).toEqual({ connection_mode: 'single' });
        });

        test('refuses an unknown mode', async () => {
            const organization = await createOrganization();
            const project = await createProject(organization.organization_id);

            await expect(
                database.raw(
                    `UPDATE projects SET connection_mode = 'several' WHERE project_uuid = ?`,
                    [project.project_uuid],
                ),
            ).rejects.toMatchObject({ code: '23514' });
        });
    });

    describe('deletion', () => {
        test('deleting an organisation with a binding on every table succeeds', async () => {
            const bound = await createBoundProject();

            await database.raw(
                `DELETE FROM organizations WHERE organization_uuid = ?`,
                [bound.organization.organization_uuid],
            );

            expect(await countProjectRows(bound.project.project_uuid)).toEqual({
                warehouse_connections: 0,
                cached_explore: 0,
                cached_explore_staging: 0,
                project_dbt_sources: 0,
                saved_sql: 0,
                events: 0,
            });
            expect(
                await countConnectionRows(bound.warehouseConnectionUuid),
            ).toEqual({
                preferences: 0,
                tables: 0,
                manifests: 0,
                catalog_cache: 0,
                saved_sql_versions: 0,
            });
        });

        test('deleting a project the way ProjectModel.delete does succeeds', async () => {
            const bound = await createBoundProject();

            await database.transaction(async (transaction) => {
                await transaction.raw(
                    `DELETE FROM catalog_search WHERE project_uuid = ?`,
                    [bound.project.project_uuid],
                );
                await transaction.raw(
                    `DELETE FROM cached_explores WHERE project_uuid = ?`,
                    [bound.project.project_uuid],
                );
                await transaction.raw(
                    `DELETE FROM cached_explore WHERE project_uuid = ?`,
                    [bound.project.project_uuid],
                );
                await transaction.raw(
                    `DELETE FROM spaces WHERE project_id = ?`,
                    [bound.project.project_id],
                );
                await transaction.raw(
                    `DELETE FROM jobs WHERE project_uuid = ?`,
                    [bound.project.project_uuid],
                );
                await transaction.raw(
                    `DELETE FROM projects WHERE project_uuid = ?`,
                    [bound.project.project_uuid],
                );
            });

            expect(
                Object.values(
                    await countProjectRows(bound.project.project_uuid),
                ),
            ).toEqual([0, 0, 0, 0, 0, 0]);
            expect(
                await one(
                    `SELECT project_uuid, warehouse_connection_uuid FROM query_history WHERE warehouse_connection_uuid = ?`,
                    [bound.warehouseConnectionUuid],
                ),
            ).toEqual({
                project_uuid: null,
                warehouse_connection_uuid: bound.warehouseConnectionUuid,
            });
        });

        test('deleting a project directly succeeds', async () => {
            const bound = await createBoundProject();

            await database.raw(`DELETE FROM projects WHERE project_uuid = ?`, [
                bound.project.project_uuid,
            ]);

            expect(
                Object.values(
                    await countProjectRows(bound.project.project_uuid),
                ),
            ).toEqual([0, 0, 0, 0, 0, 0]);
            expect(
                Object.values(
                    await countConnectionRows(bound.warehouseConnectionUuid),
                ),
            ).toEqual([0, 0, 0, 0, 0]);
        });

        const bindByTable: Record<
            string,
            (
                projectUuid: string,
                warehouseConnectionUuid: string,
            ) => Promise<unknown>
        > = {
            cached_explore: (projectUuid, warehouseConnectionUuid) =>
                database.raw(
                    `INSERT INTO cached_explore (project_uuid, name, table_names, explore, warehouse_connection_uuid)
                     VALUES (?, ?, '{}', '{}', ?)`,
                    [
                        projectUuid,
                        `bound_${randomUUID()}`,
                        warehouseConnectionUuid,
                    ],
                ),
            project_dbt_sources: (projectUuid, warehouseConnectionUuid) =>
                database.raw(
                    `INSERT INTO project_dbt_sources (project_uuid, name, warehouse_connection_uuid)
                     VALUES (?, ?, ?)`,
                    [
                        projectUuid,
                        `bound_${randomUUID()}`,
                        warehouseConnectionUuid,
                    ],
                ),
            saved_sql_versions: async (
                projectUuid,
                warehouseConnectionUuid,
            ) => {
                const { saved_sql_uuid: savedSqlUuid } = await one<{
                    saved_sql_uuid: string;
                }>(
                    `INSERT INTO saved_sql (project_uuid, name, slug) VALUES (?, 'SQL chart', ?)
                     RETURNING saved_sql_uuid`,
                    [projectUuid, `sql-chart-${randomUUID()}`],
                );
                return database.raw(
                    `INSERT INTO saved_sql_versions (saved_sql_uuid, sql, warehouse_connection_uuid)
                     VALUES (?, 'select 1', ?)`,
                    [savedSqlUuid, warehouseConnectionUuid],
                );
            },
        };

        test.each(Object.keys(bindByTable))(
            'deleting an extra connection bound by %s fails at commit',
            async (table) => {
                const organization = await createOrganization();
                const project = await createProject(
                    organization.organization_id,
                );
                const warehouseConnectionUuid = await insertExtraConnection(
                    project.project_uuid,
                );
                await bindByTable[table](
                    project.project_uuid,
                    warehouseConnectionUuid,
                );
                let statementSucceeded = false;

                await expect(
                    database.transaction(async (transaction) => {
                        await transaction.raw(
                            `DELETE FROM warehouse_connections WHERE warehouse_connection_uuid = ?`,
                            [warehouseConnectionUuid],
                        );
                        statementSucceeded = true;
                    }),
                ).rejects.toMatchObject({ code: '23503' });
                expect(statementSucceeded).toBe(true);
                expect(
                    await one(
                        `SELECT count(*)::int AS count FROM warehouse_connections WHERE warehouse_connection_uuid = ?`,
                        [warehouseConnectionUuid],
                    ),
                ).toEqual({ count: 1 });
            },
        );

        test('deleting an organisation credential that an extra connection uses fails at commit', async () => {
            const organization = await createOrganization();
            const project = await createProject(organization.organization_id);
            const organizationWarehouseCredentialsUuid =
                await createOrganizationCredential(
                    organization.organization_uuid,
                );
            await insertConnection(project.project_uuid, {
                isOriginal: false,
                warehouseType: 'postgres',
                organizationWarehouseCredentialsUuid,
            });
            let statementSucceeded = false;

            await expect(
                database.transaction(async (transaction) => {
                    await transaction.raw(
                        `DELETE FROM organization_warehouse_credentials WHERE organization_warehouse_credentials_uuid = ?`,
                        [organizationWarehouseCredentialsUuid],
                    );
                    statementSucceeded = true;
                }),
            ).rejects.toMatchObject({ code: '23503' });
            expect(statementSucceeded).toBe(true);
        });

        test('deleting an unbound extra connection removes its dependent rows', async () => {
            const organization = await createOrganization();
            const userUuid = await createUser();
            const project = await createProject(organization.organization_id);
            const warehouseConnectionUuid = await insertExtraConnection(
                project.project_uuid,
            );
            await bindEverything({
                organizationUuid: organization.organization_uuid,
                projectUuid: project.project_uuid,
                userUuid,
                warehouseConnectionUuid,
            });
            await database.raw(
                `UPDATE cached_explore SET warehouse_connection_uuid = NULL WHERE project_uuid = ?`,
                [project.project_uuid],
            );
            await database.raw(
                `UPDATE project_dbt_sources SET warehouse_connection_uuid = NULL WHERE project_uuid = ?`,
                [project.project_uuid],
            );
            await database.raw(
                `UPDATE saved_sql_versions SET warehouse_connection_uuid = NULL WHERE warehouse_connection_uuid = ?`,
                [warehouseConnectionUuid],
            );

            await database.raw(
                `DELETE FROM warehouse_connections WHERE warehouse_connection_uuid = ?`,
                [warehouseConnectionUuid],
            );

            expect(await countConnectionRows(warehouseConnectionUuid)).toEqual({
                preferences: 0,
                tables: 0,
                manifests: 0,
                catalog_cache: 0,
                saved_sql_versions: 0,
            });
            expect(
                await one(
                    `SELECT count(*)::int AS count FROM query_history WHERE warehouse_connection_uuid = ?`,
                    [warehouseConnectionUuid],
                ),
            ).toEqual({ count: 1 });
        });

        test('deleting a personal credential, then the user, keeps the connection and event with NULL user columns (F2)', async () => {
            const organization = await createOrganization();
            const userUuid = await createUser();
            const project = await createProject(organization.organization_id);
            const { warehouse_connection_uuid: warehouseConnectionUuid } =
                await one<{ warehouse_connection_uuid: string }>(
                    `INSERT INTO warehouse_connections (project_uuid, is_original, name, created_by_user_uuid)
                     VALUES (?, true, ?, ?)
                     RETURNING warehouse_connection_uuid`,
                    [
                        project.project_uuid,
                        `Connection ${randomUUID()}`.slice(0, 40),
                        userUuid,
                    ],
                );
            const { user_warehouse_credentials_uuid: userCredentialsUuid } =
                await one<{ user_warehouse_credentials_uuid: string }>(
                    `INSERT INTO user_warehouse_credentials (user_uuid, name, warehouse_type, encrypted_credentials)
                 VALUES (?, 'Personal', 'postgres', ?)
                 RETURNING user_warehouse_credentials_uuid`,
                    [userUuid, Buffer.from('ciphertext')],
                );
            await database.raw(
                `INSERT INTO warehouse_connection_user_credentials_preference
                    (user_uuid, warehouse_connection_uuid, user_warehouse_credentials_uuid)
                 VALUES (?, ?, ?)`,
                [userUuid, warehouseConnectionUuid, userCredentialsUuid],
            );
            await database.raw(
                `INSERT INTO warehouse_connection_tables
                    (warehouse_connection_uuid, user_warehouse_credentials_uuid, listed_database, database, schema, "table")
                 VALUES (?, ?, 'analytics', 'analytics', 'public', 'orders')`,
                [warehouseConnectionUuid, userCredentialsUuid],
            );
            const { project_connection_mode_event_uuid: eventUuid } =
                await one<{ project_connection_mode_event_uuid: string }>(
                    `INSERT INTO project_connection_mode_events
                    (project_uuid, actor_user_uuid, event, idempotency_key)
                 VALUES (?, ?, 'connection_added', ?)
                 RETURNING project_connection_mode_event_uuid`,
                    [project.project_uuid, userUuid, randomUUID()],
                );
            const survivingWarehouseConnectionUuid =
                await insertExtraConnection(project.project_uuid);
            const otherUserUuid = await createUser();
            const {
                user_warehouse_credentials_uuid: otherUsersCredentialsUuid,
            } = await one<{ user_warehouse_credentials_uuid: string }>(
                `INSERT INTO user_warehouse_credentials (user_uuid, name, warehouse_type, encrypted_credentials)
                 VALUES (?, 'Other user personal', 'postgres', ?)
                 RETURNING user_warehouse_credentials_uuid`,
                [otherUserUuid, Buffer.from('other-ciphertext')],
            );
            await database.raw(
                `INSERT INTO warehouse_connection_user_credentials_preference
                    (user_uuid, warehouse_connection_uuid, user_warehouse_credentials_uuid)
                 VALUES (?, ?, ?)`,
                [
                    userUuid,
                    survivingWarehouseConnectionUuid,
                    otherUsersCredentialsUuid,
                ],
            );

            await database.raw(
                `DELETE FROM user_warehouse_credentials WHERE user_warehouse_credentials_uuid = ?`,
                [userCredentialsUuid],
            );
            await database.raw(`DELETE FROM users WHERE user_uuid = ?`, [
                userUuid,
            ]);

            expect(
                await one<{ count: number }>(
                    `SELECT count(*)::int AS count FROM warehouse_connection_user_credentials_preference
                     WHERE user_warehouse_credentials_uuid = ?`,
                    [userCredentialsUuid],
                ),
            ).toEqual({ count: 0 });
            expect(
                await one<{ count: number }>(
                    `SELECT count(*)::int AS count FROM warehouse_connection_user_credentials_preference
                     WHERE user_warehouse_credentials_uuid = ?`,
                    [otherUsersCredentialsUuid],
                ),
            ).toEqual({ count: 0 });
            expect(
                await one<{ count: number }>(
                    `SELECT count(*)::int AS count FROM user_warehouse_credentials
                     WHERE user_warehouse_credentials_uuid = ?`,
                    [otherUsersCredentialsUuid],
                ),
            ).toEqual({ count: 1 });
            expect(
                await one<{ count: number }>(
                    `SELECT count(*)::int AS count FROM warehouse_connection_tables
                     WHERE user_warehouse_credentials_uuid = ?`,
                    [userCredentialsUuid],
                ),
            ).toEqual({ count: 0 });
            expect(
                await one<{ created_by_user_uuid: string | null }>(
                    `SELECT created_by_user_uuid FROM warehouse_connections WHERE warehouse_connection_uuid = ?`,
                    [warehouseConnectionUuid],
                ),
            ).toEqual({ created_by_user_uuid: null });
            expect(
                await one<{ actor_user_uuid: string | null }>(
                    `SELECT actor_user_uuid FROM project_connection_mode_events WHERE project_connection_mode_event_uuid = ?`,
                    [eventUuid],
                ),
            ).toEqual({ actor_user_uuid: null });
        });
    });

    describe('tenancy', () => {
        test.each([
            [
                'cached_explore',
                `INSERT INTO cached_explore (project_uuid, name, table_names, explore, warehouse_connection_uuid)
                 VALUES (?, ?, '{}', '{}', ?)`,
            ],
            [
                'project_dbt_sources',
                `INSERT INTO project_dbt_sources (project_uuid, name, warehouse_connection_uuid)
                 VALUES (?, ?, ?)`,
            ],
        ])(
            'the composite key refuses a %s binding to another project connection',
            async (_table, insertSql) => {
                const organization = await createOrganization();
                const owner = await createProject(organization.organization_id);
                const other = await createProject(organization.organization_id);
                const ownerConnectionUuid = await insertExtraConnection(
                    owner.project_uuid,
                );

                await expect(
                    database.transaction(async (transaction) => {
                        await transaction.raw(insertSql, [
                            other.project_uuid,
                            `bound_${randomUUID()}`,
                            ownerConnectionUuid,
                        ]);
                    }),
                ).rejects.toMatchObject({ code: '23503' });
                await expect(
                    database.transaction(async (transaction) => {
                        await transaction.raw(insertSql, [
                            owner.project_uuid,
                            `bound_${randomUUID()}`,
                            ownerConnectionUuid,
                        ]);
                    }),
                ).resolves.toBeUndefined();
            },
        );
    });

    describe('warehouse_connections constraints', () => {
        test('allows one original per project', async () => {
            const organization = await createOrganization();
            const project = await createProject(organization.organization_id);
            const otherProject = await createProject(
                organization.organization_id,
            );
            await insertConnection(project.project_uuid, { isOriginal: true });
            await insertConnection(otherProject.project_uuid, {
                isOriginal: true,
            });

            await expect(
                insertConnection(project.project_uuid, { isOriginal: true }),
            ).rejects.toMatchObject({ code: '23505' });
        });

        test('requires an extra connection to have exactly one credential source', async () => {
            const organization = await createOrganization();
            const project = await createProject(organization.organization_id);
            const organizationWarehouseCredentialsUuid =
                await createOrganizationCredential(
                    organization.organization_uuid,
                );

            await expect(
                insertConnection(project.project_uuid, {
                    isOriginal: false,
                    warehouseType: 'postgres',
                    encryptedCredentials: Buffer.from('ciphertext'),
                    organizationWarehouseCredentialsUuid,
                }),
            ).rejects.toMatchObject({ code: '23514' });
            await expect(
                insertConnection(project.project_uuid, {
                    isOriginal: false,
                    warehouseType: 'postgres',
                }),
            ).rejects.toMatchObject({ code: '23514' });
            await expect(
                insertConnection(project.project_uuid, {
                    isOriginal: false,
                    warehouseType: 'postgres',
                    encryptedCredentials: Buffer.from('ciphertext'),
                }),
            ).resolves.toEqual(expect.any(String));
            await expect(
                insertConnection(project.project_uuid, {
                    isOriginal: false,
                    warehouseType: 'postgres',
                    organizationWarehouseCredentialsUuid,
                }),
            ).resolves.toEqual(expect.any(String));
        });

        test('requires a warehouse type on an extra connection', async () => {
            const organization = await createOrganization();
            const project = await createProject(organization.organization_id);

            await expect(
                insertConnection(project.project_uuid, {
                    isOriginal: false,
                    encryptedCredentials: Buffer.from('ciphertext'),
                }),
            ).rejects.toMatchObject({ code: '23514' });
        });

        test('keeps credentials and a warehouse type off the original', async () => {
            const organization = await createOrganization();
            const project = await createProject(organization.organization_id);

            await expect(
                insertConnection(project.project_uuid, {
                    isOriginal: true,
                    encryptedCredentials: Buffer.from('ciphertext'),
                }),
            ).rejects.toMatchObject({ code: '23514' });
            await expect(
                insertConnection(project.project_uuid, {
                    isOriginal: true,
                    warehouseType: 'postgres',
                }),
            ).rejects.toMatchObject({ code: '23514' });
        });

        test.each([
            ['empty', ''],
            ['whitespace-only', '   '],
            ['padded', ' Analytics '],
            ['over-long', 'a'.repeat(101)],
        ])('refuses an %s name', async (_label, name) => {
            const organization = await createOrganization();
            const project = await createProject(organization.organization_id);

            await expect(
                insertConnection(project.project_uuid, {
                    isOriginal: true,
                    name,
                }),
            ).rejects.toMatchObject({ code: '23514' });
        });

        test('accepts a 100-character name and refuses a duplicate in the same project', async () => {
            const organization = await createOrganization();
            const project = await createProject(organization.organization_id);
            const name = 'a'.repeat(100);
            await insertConnection(project.project_uuid, {
                isOriginal: true,
                name,
            });

            await expect(
                insertConnection(project.project_uuid, {
                    isOriginal: false,
                    name,
                    warehouseType: 'postgres',
                    encryptedCredentials: Buffer.from('ciphertext'),
                }),
            ).rejects.toMatchObject({ code: '23505' });
        });
    });

    describe('project_connection_mode_events', () => {
        test('refuses an unknown event and a repeated idempotency key', async () => {
            const organization = await createOrganization();
            const project = await createProject(organization.organization_id);
            const insertEvent = (
                event: string,
                idempotencyKey: string | null,
            ) =>
                database.raw(
                    `INSERT INTO project_connection_mode_events (project_uuid, event, idempotency_key)
                     VALUES (?, ?, ?)`,
                    [project.project_uuid, event, idempotencyKey],
                );
            const idempotencyKey = randomUUID();

            await expect(insertEvent('renamed', null)).rejects.toMatchObject({
                code: '23514',
            });
            await insertEvent('switched_to_multi', idempotencyKey);
            await expect(
                insertEvent('connection_added', idempotencyKey),
            ).rejects.toMatchObject({ code: '23505' });
            await insertEvent('rescued_by_engineering', null);
            await insertEvent('rescued_by_engineering', null);
        });
    });

    describe('previous release compatibility', () => {
        test('rows written without the new columns bind to the original', async () => {
            const organization = await createOrganization();
            const project = await createProject(organization.organization_id);
            await database.raw(
                `INSERT INTO cached_explore (project_uuid, name, table_names, explore) VALUES (?, 'legacy', '{}', '{}')`,
                [project.project_uuid],
            );
            await database.raw(
                `INSERT INTO project_dbt_sources (project_uuid, name) VALUES (?, 'legacy')`,
                [project.project_uuid],
            );

            expect(
                await rows(
                    `SELECT warehouse_connection_uuid FROM cached_explore WHERE project_uuid = ?
                     UNION ALL
                     SELECT warehouse_connection_uuid FROM project_dbt_sources WHERE project_uuid = ?`,
                    [project.project_uuid, project.project_uuid],
                ),
            ).toEqual([
                { warehouse_connection_uuid: null },
                { warehouse_connection_uuid: null },
            ]);
        });
    });

    describe('catalog shape (F3)', () => {
        test('every new index is valid with the exact definition, and every new FK and the M1 check are validated', async () => {
            const indexNames = [
                'warehouse_connections_one_original_per_project',
                'warehouse_connections_organization_credentials_idx',
                'warehouse_connections_created_by_user_uuid_idx',
                'warehouse_connections_warehouse_type_idx',
                'warehouse_connection_preference_connection_idx',
                'warehouse_connection_preference_user_credentials_idx',
                'warehouse_connection_tables_scope_idx',
                'warehouse_connection_tables_user_credentials_idx',
                'project_connection_mode_events_idempotency_key_unique',
                'project_connection_mode_events_project_uuid_idx',
                'project_connection_mode_events_actor_user_uuid_idx',
                'cached_explore_warehouse_connection_uuid_idx',
                'project_dbt_sources_warehouse_connection_uuid_idx',
                'saved_sql_versions_warehouse_connection_uuid_idx',
                'query_history_active_warehouse_connection_uuid_idx',
            ];
            const expectedIndexDefs: Record<string, string> = {
                warehouse_connections_one_original_per_project:
                    'CREATE UNIQUE INDEX warehouse_connections_one_original_per_project ON public.warehouse_connections USING btree (project_uuid) WHERE is_original',
                warehouse_connections_organization_credentials_idx:
                    'CREATE INDEX warehouse_connections_organization_credentials_idx ON public.warehouse_connections USING btree (organization_warehouse_credentials_uuid)',
                warehouse_connections_created_by_user_uuid_idx:
                    'CREATE INDEX warehouse_connections_created_by_user_uuid_idx ON public.warehouse_connections USING btree (created_by_user_uuid)',
                warehouse_connections_warehouse_type_idx:
                    'CREATE INDEX warehouse_connections_warehouse_type_idx ON public.warehouse_connections USING btree (warehouse_type)',
                warehouse_connection_preference_connection_idx:
                    'CREATE INDEX warehouse_connection_preference_connection_idx ON public.warehouse_connection_user_credentials_preference USING btree (warehouse_connection_uuid)',
                warehouse_connection_preference_user_credentials_idx:
                    'CREATE INDEX warehouse_connection_preference_user_credentials_idx ON public.warehouse_connection_user_credentials_preference USING btree (user_warehouse_credentials_uuid)',
                warehouse_connection_tables_scope_idx:
                    'CREATE INDEX warehouse_connection_tables_scope_idx ON public.warehouse_connection_tables USING btree (warehouse_connection_uuid, user_warehouse_credentials_uuid, listed_database)',
                warehouse_connection_tables_user_credentials_idx:
                    'CREATE INDEX warehouse_connection_tables_user_credentials_idx ON public.warehouse_connection_tables USING btree (user_warehouse_credentials_uuid)',
                project_connection_mode_events_idempotency_key_unique:
                    'CREATE UNIQUE INDEX project_connection_mode_events_idempotency_key_unique ON public.project_connection_mode_events USING btree (idempotency_key)',
                project_connection_mode_events_project_uuid_idx:
                    'CREATE INDEX project_connection_mode_events_project_uuid_idx ON public.project_connection_mode_events USING btree (project_uuid)',
                project_connection_mode_events_actor_user_uuid_idx:
                    'CREATE INDEX project_connection_mode_events_actor_user_uuid_idx ON public.project_connection_mode_events USING btree (actor_user_uuid)',
                cached_explore_warehouse_connection_uuid_idx:
                    'CREATE INDEX cached_explore_warehouse_connection_uuid_idx ON public.cached_explore USING btree (warehouse_connection_uuid) WHERE (warehouse_connection_uuid IS NOT NULL)',
                project_dbt_sources_warehouse_connection_uuid_idx:
                    'CREATE INDEX project_dbt_sources_warehouse_connection_uuid_idx ON public.project_dbt_sources USING btree (warehouse_connection_uuid) WHERE (warehouse_connection_uuid IS NOT NULL)',
                saved_sql_versions_warehouse_connection_uuid_idx:
                    'CREATE INDEX saved_sql_versions_warehouse_connection_uuid_idx ON public.saved_sql_versions USING btree (warehouse_connection_uuid) WHERE (warehouse_connection_uuid IS NOT NULL)',
                query_history_active_warehouse_connection_uuid_idx:
                    "CREATE INDEX query_history_active_warehouse_connection_uuid_idx ON public.query_history USING btree (warehouse_connection_uuid) WHERE ((status)::text = ANY ((ARRAY['pending'::character varying, 'queued'::character varying, 'executing'::character varying])::text[]))",
            };

            const indexRows = await rows<{
                relname: string;
                indexdef: string;
                indisvalid: boolean;
            }>(
                `SELECT c.relname, pg_get_indexdef(i.indexrelid) AS indexdef, i.indisvalid
                 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
                 WHERE c.relname = ANY(?)`,
                [indexNames],
            );
            expect(indexRows.map(({ relname }) => relname).sort()).toEqual(
                [...indexNames].sort(),
            );
            expect(indexRows.every(({ indisvalid }) => indisvalid)).toBe(true);
            indexRows.forEach(({ relname, indexdef }) => {
                expect(indexdef).toEqual(expectedIndexDefs[relname]);
            });

            const constraintNames = [
                'warehouse_connections_project_uuid_fkey',
                'warehouse_connections_warehouse_type_fkey',
                'warehouse_connections_organization_credentials_fkey',
                'warehouse_connections_created_by_user_uuid_fkey',
                'warehouse_connection_preference_user_uuid_fkey',
                'warehouse_connection_preference_connection_fkey',
                'warehouse_connection_preference_user_credentials_fkey',
                'warehouse_connection_tables_connection_fkey',
                'warehouse_connection_tables_user_credentials_fkey',
                'warehouse_connection_manifests_connection_fkey',
                'warehouse_connection_catalog_cache_connection_fkey',
                'project_connection_mode_events_project_uuid_fkey',
                'project_connection_mode_events_actor_user_uuid_fkey',
                'cached_explore_warehouse_connection_fkey',
                'project_dbt_sources_warehouse_connection_fkey',
                'saved_sql_versions_warehouse_connection_fkey',
                'projects_connection_mode_check',
            ];
            const constraintRows = await rows<{
                conname: string;
                convalidated: boolean;
            }>(
                `SELECT conname, convalidated FROM pg_constraint WHERE conname = ANY(?)`,
                [constraintNames],
            );
            expect(constraintRows.map(({ conname }) => conname).sort()).toEqual(
                [...constraintNames].sort(),
            );
            expect(
                constraintRows.every(({ convalidated }) => convalidated),
            ).toBe(true);
        });
    });

    describe('reversal', () => {
        const runInOrder = (
            migrations: Migration[],
            step: (migration: Migration) => Promise<void>,
        ) =>
            migrations.reduce<Promise<void>>(
                (previous, migration) => previous.then(() => step(migration)),
                Promise.resolve(),
            );

        test('down refuses while a project is multi, then reverses, and the added columns reuse no existing name', async () => {
            const migrations = await Promise.all(
                MIGRATION_NAMES.map((name) => loadMigration(name)),
            );
            const reversed = [...migrations].reverse();
            const afterColumns = await columnNames();
            const organization = await createOrganization();
            const project = await createProject(organization.organization_id);
            await database.raw(
                `UPDATE projects SET connection_mode = 'multi' WHERE project_uuid = ?`,
                [project.project_uuid],
            );

            await expect(reversed[0].down(database)).rejects.toThrow(
                /^irreversible:/,
            );
            await expect(reversed[1].down(database)).rejects.toThrow(
                /^irreversible:/,
            );
            await expect(reversed[2].down(database)).rejects.toThrow(
                /^irreversible:/,
            );

            await Promise.all(
                BOUND_TABLES.map((table) =>
                    database.raw(
                        `UPDATE ?? SET warehouse_connection_uuid = NULL WHERE warehouse_connection_uuid IS NOT NULL`,
                        [table],
                    ),
                ),
            );
            await database.raw(`DELETE FROM project_connection_mode_events`);
            await database.raw(`DELETE FROM warehouse_connections`);
            await database.raw(
                `UPDATE projects SET connection_mode = 'single' WHERE connection_mode = 'multi'`,
            );
            await runInOrder(reversed, (migration) => migration.down(database));
            await runInOrder(reversed, (migration) => migration.down(database));
            const beforeColumns = await columnNames();

            expect(
                beforeColumns.filter(
                    ({ table, column }) =>
                        NEW_TABLES.includes(table) ||
                        column === 'connection_mode' ||
                        column === 'warehouse_connection_uuid',
                ),
            ).toEqual([]);

            await runInOrder(migrations, (migration) => migration.up(database));
            await runInOrder(migrations, (migration) => migration.up(database));
            const reappliedColumns = await columnNames();
            const sortColumns = (columns: ColumnName[]) =>
                columns.map(({ table, column }) => `${table}.${column}`).sort();

            expect(sortColumns(reappliedColumns)).toEqual(
                sortColumns(afterColumns),
            );
            const addedToExistingTables = afterColumns.filter(
                ({ table, column }) =>
                    !NEW_TABLES.includes(table) &&
                    !beforeColumns.some(
                        (before) =>
                            before.table === table && before.column === column,
                    ),
            );
            expect(sortColumns(addedToExistingTables)).toEqual(
                sortColumns([
                    { table: 'projects', column: 'connection_mode' },
                    ...BOUND_TABLES.map((table) => ({
                        table,
                        column: 'warehouse_connection_uuid',
                    })),
                ]),
            );
            expect(
                findReusedColumnNames(beforeColumns, afterColumns, NEW_TABLES),
            ).toEqual([]);
        });
    });
});

describe('M3 concurrent index builds under contention and crash recovery (SPK-2335)', () => {
    let admin: Knex;
    let database: Knex;
    let blocker: Knex;
    let databaseName: string;

    beforeAll(async () => {
        const adminDatabase = getAdminDatabase();
        databaseName = `connection_modes_contention_${randomUUID().replaceAll(
            '-',
            '',
        )}`;
        admin = knex({
            client: 'pg',
            connection: { ...connectionSettings(), database: adminDatabase },
        });
        await admin.raw('CREATE DATABASE ??', [databaseName]);
        const settings = connectionSettings();
        execFileSync('pnpm', ['migrate'], {
            cwd: process.cwd(),
            env: {
                ...process.env,
                PGCONNECTIONURI: `postgres://${encodeURIComponent(
                    settings.user ?? '',
                )}:${encodeURIComponent(settings.password ?? '')}@${
                    settings.host
                }:${settings.port}/${databaseName}`,
            },
            stdio: 'pipe',
        });
        database = knex({
            client: 'pg',
            connection: { ...connectionSettings(), database: databaseName },
            pool: { min: 0, max: 4 },
        });
        blocker = knex({
            client: 'pg',
            connection: { ...connectionSettings(), database: databaseName },
            pool: { min: 1, max: 1 },
        });
    }, 600000);

    afterAll(async () => {
        await database?.destroy();
        await blocker?.destroy();
        await admin?.raw('DROP DATABASE IF EXISTS ?? WITH (FORCE)', [
            databaseName,
        ]);
        await admin?.destroy();
    });

    test('a long, unrelated active transaction does not park the concurrent index build (F1)', async () => {
        const m3 = await loadMigration(
            '20260923200200_add_warehouse_connection_bindings',
        );
        await m3.down(database);

        const blockerConnection = await blocker.client.acquireConnection();
        await blocker.raw('BEGIN').connection(blockerConnection);
        const blockerSleep = blocker
            .raw('SELECT pg_sleep(8)')
            .connection(blockerConnection);

        const upPromise = m3.up(database);

        await blockerSleep;
        await blocker.raw('COMMIT').connection(blockerConnection);
        await blocker.client.releaseConnection(blockerConnection);

        await expect(upPromise).resolves.toBeUndefined();

        const invalidIndexes = await database.raw<{
            rows: { relname: string }[];
        }>(
            `SELECT c.relname FROM pg_class c
             JOIN pg_index i ON i.indexrelid = c.oid
             WHERE NOT i.indisvalid AND c.relname LIKE '%warehouse_connection_uuid_idx'`,
        );
        expect(invalidIndexes.rows).toEqual([]);
    }, 60000);

    test('a database default lock_timeout does not park the concurrent index build (F1-r2)', async () => {
        const m3 = await loadMigration(
            '20260923200200_add_warehouse_connection_bindings',
        );
        await m3.down(database);
        await admin.raw(`ALTER DATABASE ?? SET lock_timeout = '5s'`, [
            databaseName,
        ]);
        const freshSessions = knex({
            client: 'pg',
            connection: { ...connectionSettings(), database: databaseName },
            pool: { min: 0, max: 4 },
        });
        try {
            const sessionDefault = await freshSessions.raw<{
                rows: { lock_timeout: string }[];
            }>('SHOW lock_timeout');
            expect(sessionDefault.rows).toEqual([{ lock_timeout: '5s' }]);

            const blockerConnection = await blocker.client.acquireConnection();
            await blocker.raw('BEGIN').connection(blockerConnection);
            const blockerSleep = blocker
                .raw('SELECT pg_sleep(8)')
                .connection(blockerConnection);

            const upPromise = m3.up(freshSessions);

            await blockerSleep;
            await blocker.raw('COMMIT').connection(blockerConnection);
            await blocker.client.releaseConnection(blockerConnection);

            await expect(upPromise).resolves.toBeUndefined();
        } finally {
            await freshSessions.destroy();
            await admin.raw(`ALTER DATABASE ?? RESET lock_timeout`, [
                databaseName,
            ]);
        }

        const invalidIndexes = await database.raw<{
            rows: { relname: string }[];
        }>(
            `SELECT c.relname FROM pg_class c
             JOIN pg_index i ON i.indexrelid = c.oid
             WHERE NOT i.indisvalid AND c.relname LIKE '%warehouse_connection_uuid_idx'`,
        );
        expect(invalidIndexes.rows).toEqual([]);
    }, 60000);

    test('recovers an index left invalid by an interrupted build (F3)', async () => {
        const m3 = await loadMigration(
            '20260923200200_add_warehouse_connection_bindings',
        );

        await database.raw(
            `UPDATE pg_index SET indisvalid = false
             WHERE indexrelid = 'cached_explore_warehouse_connection_uuid_idx'::regclass`,
        );
        const before = await database.raw<{
            rows: { indisvalid: boolean }[];
        }>(
            `SELECT indisvalid FROM pg_index
             WHERE indexrelid = 'cached_explore_warehouse_connection_uuid_idx'::regclass`,
        );
        expect(before.rows).toEqual([{ indisvalid: false }]);

        await m3.up(database);

        const after = await database.raw<{ rows: { indisvalid: boolean }[] }>(
            `SELECT indisvalid FROM pg_index
             WHERE indexrelid = 'cached_explore_warehouse_connection_uuid_idx'::regclass`,
        );
        expect(after.rows).toEqual([{ indisvalid: true }]);
    }, 60000);
});
