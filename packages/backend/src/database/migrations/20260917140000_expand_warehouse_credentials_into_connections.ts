import type { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Expands warehouse credentials with nullable and defaulted connection metadata while preserving the project uniqueness contract',
} as const;

export const config = { transaction: false };

const TABLE = 'warehouse_credentials';
const BATCH_SIZE = 10000;
const LOCK_TIMEOUT = '5s';
const UUID_INDEX = 'warehouse_credentials_uuid_unique';
const ORG_INDEX = 'warehouse_credentials_org_credential_uuid_idx';
const PROJECT_NAME_INDEX = 'warehouse_credentials_project_name_unique';
const UUID_NOT_NULL_CHECK = 'warehouse_credentials_uuid_not_null';
const NAME_NOT_NULL_CHECK = 'warehouse_credentials_name_not_null';
const ORG_FOREIGN_KEY = 'warehouse_credentials_org_credential_uuid_fkey';
const CREDENTIALS_OR_ORG_CHECK =
    'warehouse_credentials_credentials_or_org_check';
const WAREHOUSE_DISPLAY_NAMES = {
    athena: 'Athena',
    snowflake: 'Snowflake',
    bigquery: 'BigQuery',
    postgres: 'Postgres',
    redshift: 'Redshift',
    databricks: 'Databricks',
    trino: 'Trino',
    clickhouse: 'ClickHouse',
    duckdb: 'DuckDB',
} as const;
type DatabaseConnection = Awaited<
    ReturnType<Knex['client']['acquireConnection']>
>;

const runDdl = async (
    knex: Knex,
    connection: DatabaseConnection,
    message: string,
    sql: string,
): Promise<void> => {
    // eslint-disable-next-line no-console
    console.log(message);
    await knex
        .raw(`SET lock_timeout = '${LOCK_TIMEOUT}'`)
        .connection(connection);
    try {
        await knex.raw(sql).connection(connection);
    } finally {
        await knex.raw('RESET lock_timeout').connection(connection);
    }
};

const constraintExists = async (
    knex: Knex,
    connection: DatabaseConnection,
    constraintName: string,
): Promise<boolean> => {
    const result = await knex
        .raw<{ rowCount: number }>(
            `SELECT 1 FROM pg_constraint WHERE conname = ? AND conrelid = ?::regclass`,
            [constraintName, TABLE],
        )
        .connection(connection);
    return (result.rowCount ?? 0) > 0;
};

const dropInvalidIndex = async (
    knex: Knex,
    connection: DatabaseConnection,
    indexName: string,
): Promise<void> => {
    const result = await knex
        .raw<{ rowCount: number }>(
            `SELECT 1
             FROM pg_class c
             JOIN pg_index i ON i.indexrelid = c.oid
             WHERE c.relname = ? AND NOT i.indisvalid`,
            [indexName],
        )
        .connection(connection);
    if ((result.rowCount ?? 0) > 0) {
        await runDdl(
            knex,
            connection,
            `Dropping invalid index ${indexName}`,
            `DROP INDEX CONCURRENTLY IF EXISTS ${indexName}`,
        );
    }
};

const addNotNull = async (
    knex: Knex,
    connection: DatabaseConnection,
    column: string,
    checkName: string,
): Promise<void> => {
    if (!(await constraintExists(knex, connection, checkName))) {
        await runDdl(
            knex,
            connection,
            `Adding ${checkName}`,
            `ALTER TABLE ${TABLE} ADD CONSTRAINT ${checkName} CHECK (${column} IS NOT NULL) NOT VALID`,
        );
    }
    await runDdl(
        knex,
        connection,
        `Validating ${checkName}`,
        `ALTER TABLE ${TABLE} VALIDATE CONSTRAINT ${checkName}`,
    );
    await runDdl(
        knex,
        connection,
        `Setting ${column} not null`,
        `ALTER TABLE ${TABLE} ALTER COLUMN ${column} SET NOT NULL`,
    );
    await runDdl(
        knex,
        connection,
        `Dropping ${checkName}`,
        `ALTER TABLE ${TABLE} DROP CONSTRAINT IF EXISTS ${checkName}`,
    );
};

const backfillUuids = async (
    knex: Knex,
    connection: DatabaseConnection,
): Promise<void> => {
    let total = 0;
    for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const result = await knex
            .raw<{ rowCount: number }>(
                `WITH batch AS (
                SELECT warehouse_credentials_id
                FROM ${TABLE}
                WHERE warehouse_credentials_uuid IS NULL
                ORDER BY warehouse_credentials_id
                LIMIT ${BATCH_SIZE}
            )
            UPDATE ${TABLE} target
            SET warehouse_credentials_uuid = uuid_generate_v4()
            FROM batch
            WHERE target.warehouse_credentials_id = batch.warehouse_credentials_id`,
            )
            .connection(connection);
        const updated = result.rowCount ?? 0;
        if (updated === 0) return;
        total += updated;
        // eslint-disable-next-line no-console
        console.log(`Backfilled ${total} warehouse credential UUIDs`);
    }
};

const displayNameCase = () =>
    Object.keys(WAREHOUSE_DISPLAY_NAMES)
        .map(() => 'WHEN ? THEN ?')
        .join(' ');

const displayNameBindings = () =>
    Object.entries(WAREHOUSE_DISPLAY_NAMES).flatMap(([type, name]) => [
        type,
        name,
    ]);

const backfillNames = async (
    knex: Knex,
    connection: DatabaseConnection,
): Promise<void> => {
    let total = 0;
    for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const result = await knex
            .raw<{ rowCount: number }>(
                `WITH batch AS (
                SELECT warehouse_credentials_id
                FROM ${TABLE}
                WHERE name IS NULL
                ORDER BY warehouse_credentials_id
                LIMIT ${BATCH_SIZE}
            )
            UPDATE ${TABLE} target
            SET name = CASE target.warehouse_type
                ${displayNameCase()}
                ELSE target.warehouse_type
            END
            FROM batch
            WHERE target.warehouse_credentials_id = batch.warehouse_credentials_id`,
                displayNameBindings(),
            )
            .connection(connection);
        const updated = result.rowCount ?? 0;
        if (updated === 0) return;
        total += updated;
        // eslint-disable-next-line no-console
        console.log(`Backfilled ${total} warehouse credential names`);
    }
};

const mapOrganizationPointers = async (
    knex: Knex,
    connection: DatabaseConnection,
): Promise<void> => {
    let total = 0;
    for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const result = await knex
            .raw<{ rowCount: number }>(
                `WITH batch AS (
                SELECT
                    credentials.warehouse_credentials_id,
                    projects.organization_warehouse_credentials_uuid
                FROM ${TABLE} credentials
                JOIN projects
                    ON projects.project_id = credentials.project_id
                WHERE projects.organization_warehouse_credentials_uuid IS NOT NULL
                  AND credentials.organization_warehouse_credentials_uuid IS DISTINCT FROM projects.organization_warehouse_credentials_uuid
                ORDER BY credentials.warehouse_credentials_id
                LIMIT ${BATCH_SIZE}
            )
            UPDATE ${TABLE} target
            SET organization_warehouse_credentials_uuid = batch.organization_warehouse_credentials_uuid
            FROM batch
            WHERE target.warehouse_credentials_id = batch.warehouse_credentials_id`,
            )
            .connection(connection);
        const updated = result.rowCount ?? 0;
        if (updated === 0) return;
        total += updated;
        // eslint-disable-next-line no-console
        console.log(`Mapped ${total} organization credential pointers`);
    }
};

const insertMissingOrganizationConnections = async (
    knex: Knex,
    connection: DatabaseConnection,
): Promise<void> => {
    let total = 0;
    for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const result = await knex
            .raw<{ rowCount: number }>(
                `WITH batch AS (
                SELECT
                    projects.project_id,
                    organization_credentials.warehouse_type,
                    projects.organization_warehouse_credentials_uuid
                FROM projects
                JOIN organization_warehouse_credentials organization_credentials
                    ON organization_credentials.organization_warehouse_credentials_uuid = projects.organization_warehouse_credentials_uuid
                LEFT JOIN ${TABLE} credentials
                    ON credentials.project_id = projects.project_id
                WHERE projects.organization_warehouse_credentials_uuid IS NOT NULL
                  AND credentials.warehouse_credentials_id IS NULL
                ORDER BY projects.project_id
                LIMIT ${BATCH_SIZE}
            )
            INSERT INTO ${TABLE} (
                project_id,
                warehouse_type,
                name,
                encrypted_credentials,
                organization_warehouse_credentials_uuid
            )
            SELECT
                project_id,
                warehouse_type,
                CASE warehouse_type
                    ${displayNameCase()}
                    ELSE warehouse_type
                END,
                NULL,
                organization_warehouse_credentials_uuid
            FROM batch
            ON CONFLICT DO NOTHING`,
                displayNameBindings(),
            )
            .connection(connection);
        const inserted = result.rowCount ?? 0;
        if (inserted === 0) return;
        total += inserted;
        // eslint-disable-next-line no-console
        console.log(`Inserted ${total} organization connection rows`);
    }
};

const createConcurrentIndex = async (
    knex: Knex,
    connection: DatabaseConnection,
    indexName: string,
    sql: string,
): Promise<void> => {
    await dropInvalidIndex(knex, connection, indexName);
    await runDdl(knex, connection, `Creating ${indexName}`, sql);
};

export async function up(knex: Knex): Promise<void> {
    const connection = await knex.client.acquireConnection();
    try {
        await knex.raw('SET statement_timeout = 0').connection(connection);
        await runDdl(
            knex,
            connection,
            'Adding warehouse_credentials_uuid',
            `ALTER TABLE ${TABLE} ADD COLUMN IF NOT EXISTS warehouse_credentials_uuid uuid`,
        );
        await runDdl(
            knex,
            connection,
            'Setting warehouse_credentials_uuid default',
            `ALTER TABLE ${TABLE} ALTER COLUMN warehouse_credentials_uuid SET DEFAULT uuid_generate_v4()`,
        );
        await runDdl(
            knex,
            connection,
            'Adding connection name',
            `ALTER TABLE ${TABLE} ADD COLUMN IF NOT EXISTS name text`,
        );
        await runDdl(
            knex,
            connection,
            'Adding organization credential pointer',
            `ALTER TABLE ${TABLE} ADD COLUMN IF NOT EXISTS organization_warehouse_credentials_uuid uuid NULL`,
        );
        await runDdl(
            knex,
            connection,
            'Adding list_all_databases',
            `ALTER TABLE ${TABLE} ADD COLUMN IF NOT EXISTS list_all_databases boolean NOT NULL DEFAULT false`,
        );
        await runDdl(
            knex,
            connection,
            'Adding additional_databases',
            `ALTER TABLE ${TABLE} ADD COLUMN IF NOT EXISTS additional_databases text[] NOT NULL DEFAULT '{}'::text[]`,
        );
        await runDdl(
            knex,
            connection,
            'Adding superseded_at',
            `ALTER TABLE ${TABLE} ADD COLUMN IF NOT EXISTS superseded_at timestamp NULL`,
        );
        await runDdl(
            knex,
            connection,
            'Allowing organization connections without ciphertext',
            `ALTER TABLE ${TABLE} ALTER COLUMN encrypted_credentials DROP NOT NULL`,
        );

        if (!(await constraintExists(knex, connection, ORG_FOREIGN_KEY))) {
            await runDdl(
                knex,
                connection,
                `Adding ${ORG_FOREIGN_KEY}`,
                `ALTER TABLE ${TABLE}
                 ADD CONSTRAINT ${ORG_FOREIGN_KEY}
                 FOREIGN KEY (organization_warehouse_credentials_uuid)
                 REFERENCES organization_warehouse_credentials (organization_warehouse_credentials_uuid)
                 ON DELETE RESTRICT
                 NOT VALID`,
            );
        }

        await backfillUuids(knex, connection);
        await backfillNames(knex, connection);
        await mapOrganizationPointers(knex, connection);
        await insertMissingOrganizationConnections(knex, connection);
        await mapOrganizationPointers(knex, connection);
        await backfillUuids(knex, connection);
        await backfillNames(knex, connection);

        await runDdl(
            knex,
            connection,
            'Setting connection name default',
            `ALTER TABLE ${TABLE} ALTER COLUMN name SET DEFAULT 'Connection'`,
        );
        await addNotNull(
            knex,
            connection,
            'warehouse_credentials_uuid',
            UUID_NOT_NULL_CHECK,
        );
        await addNotNull(knex, connection, 'name', NAME_NOT_NULL_CHECK);

        await runDdl(
            knex,
            connection,
            `Validating ${ORG_FOREIGN_KEY}`,
            `ALTER TABLE ${TABLE} VALIDATE CONSTRAINT ${ORG_FOREIGN_KEY}`,
        );

        if (
            !(await constraintExists(
                knex,
                connection,
                CREDENTIALS_OR_ORG_CHECK,
            ))
        ) {
            await runDdl(
                knex,
                connection,
                `Adding ${CREDENTIALS_OR_ORG_CHECK}`,
                `ALTER TABLE ${TABLE}
                 ADD CONSTRAINT ${CREDENTIALS_OR_ORG_CHECK}
                 CHECK (encrypted_credentials IS NOT NULL OR organization_warehouse_credentials_uuid IS NOT NULL)
                 NOT VALID`,
            );
        }
        await runDdl(
            knex,
            connection,
            `Validating ${CREDENTIALS_OR_ORG_CHECK}`,
            `ALTER TABLE ${TABLE} VALIDATE CONSTRAINT ${CREDENTIALS_OR_ORG_CHECK}`,
        );

        await createConcurrentIndex(
            knex,
            connection,
            UUID_INDEX,
            `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ${UUID_INDEX} ON ${TABLE} (warehouse_credentials_uuid)`,
        );
        await createConcurrentIndex(
            knex,
            connection,
            ORG_INDEX,
            `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${ORG_INDEX} ON ${TABLE} (organization_warehouse_credentials_uuid)`,
        );
        await createConcurrentIndex(
            knex,
            connection,
            PROJECT_NAME_INDEX,
            `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ${PROJECT_NAME_INDEX} ON ${TABLE} (project_id, name) WHERE superseded_at IS NULL`,
        );
    } finally {
        try {
            await knex.raw('RESET statement_timeout').connection(connection);
            await knex.raw('RESET lock_timeout').connection(connection);
        } finally {
            await knex.client.releaseConnection(connection);
        }
    }
}

export async function down(knex: Knex): Promise<void> {
    const connection = await knex.client.acquireConnection();
    try {
        const [{ count }] = await knex(TABLE)
            .whereNull('encrypted_credentials')
            .count<{ count: string }[]>('* as count')
            .connection(connection);
        if (Number(count) > 0) {
            throw new Error(
                'irreversible: warehouse credential rows without ciphertext cannot be restored to the previous schema',
            );
        }

        await knex.raw('SET statement_timeout = 0').connection(connection);
        await runDdl(
            knex,
            connection,
            `Dropping ${CREDENTIALS_OR_ORG_CHECK}`,
            `ALTER TABLE ${TABLE} DROP CONSTRAINT IF EXISTS ${CREDENTIALS_OR_ORG_CHECK}`,
        );
        await addNotNull(
            knex,
            connection,
            'encrypted_credentials',
            'warehouse_credentials_encrypted_credentials_not_null',
        );
        await runDdl(
            knex,
            connection,
            `Dropping ${PROJECT_NAME_INDEX}`,
            `DROP INDEX CONCURRENTLY IF EXISTS ${PROJECT_NAME_INDEX}`,
        );
        await runDdl(
            knex,
            connection,
            `Dropping ${ORG_INDEX}`,
            `DROP INDEX CONCURRENTLY IF EXISTS ${ORG_INDEX}`,
        );
        await runDdl(
            knex,
            connection,
            `Dropping ${UUID_INDEX}`,
            `DROP INDEX CONCURRENTLY IF EXISTS ${UUID_INDEX}`,
        );
        await runDdl(
            knex,
            connection,
            `Dropping ${ORG_FOREIGN_KEY}`,
            `ALTER TABLE ${TABLE} DROP CONSTRAINT IF EXISTS ${ORG_FOREIGN_KEY}`,
        );
        for (const column of [
            'superseded_at',
            'additional_databases',
            'list_all_databases',
            'organization_warehouse_credentials_uuid',
            'name',
            'warehouse_credentials_uuid',
        ]) {
            // eslint-disable-next-line no-await-in-loop
            await runDdl(
                knex,
                connection,
                `Dropping ${column}`,
                `ALTER TABLE ${TABLE} DROP COLUMN IF EXISTS ${column}`,
            );
        }
    } finally {
        try {
            await knex.raw('RESET statement_timeout').connection(connection);
            await knex.raw('RESET lock_timeout').connection(connection);
        } finally {
            await knex.client.releaseConnection(connection);
        }
    }
}
