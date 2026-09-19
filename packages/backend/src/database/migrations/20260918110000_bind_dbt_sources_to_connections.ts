import type { Knex } from 'knex';

export const config = { transaction: false };

export const classification = {
    kind: 'safe',
    reason: 'Adds source and content bindings, backfills them in batches, and validates the required source binding before enforcing it.',
} as const;

const BATCH_SIZE = 10000;
const SOURCE_CONNECTION_CHECK = 'project_dbt_sources_connection_uuid_not_null';

const report = (message: string) => process.stdout.write(`${message}\n`);

const runDdl = async (knex: Knex, connection: unknown, sql: string) =>
    knex.raw(sql).connection(connection);

const createSourceConnectionIndex = async (knex: Knex, connection: unknown) => {
    const invalid = await knex
        .raw<{ rowCount: number }>(
            `SELECT 1
             FROM pg_class
             JOIN pg_index ON pg_index.indexrelid = pg_class.oid
             WHERE pg_class.relname = 'project_dbt_sources_connection_uuid_idx'
               AND pg_index.indrelid = 'project_dbt_sources'::regclass
               AND NOT pg_index.indisvalid`,
        )
        .connection(connection);
    if ((invalid.rowCount ?? 0) > 0) {
        await knex
            .raw(
                'DROP INDEX CONCURRENTLY IF EXISTS project_dbt_sources_connection_uuid_idx',
            )
            .connection(connection);
    }
    await knex
        .raw(
            'CREATE INDEX CONCURRENTLY IF NOT EXISTS project_dbt_sources_connection_uuid_idx ON project_dbt_sources (connection_uuid)',
        )
        .connection(connection);
};

const backfillSourceConnections = async (
    knex: Knex,
    connection: unknown,
    total = 0,
): Promise<void> => {
    const result = await knex
        .raw<{ rowCount: number }>(
            `WITH batch AS (
                SELECT sources.project_dbt_source_uuid, credentials.warehouse_credentials_uuid
                FROM project_dbt_sources sources
                JOIN projects ON projects.project_uuid = sources.project_uuid
                JOIN LATERAL (
                    SELECT warehouse_credentials_uuid
                    FROM warehouse_credentials candidate
                    WHERE candidate.project_id = projects.project_id
                      AND candidate.superseded_at IS NULL
                      AND 1 = (
                          SELECT count(*)
                          FROM warehouse_credentials counted
                          WHERE counted.project_id = projects.project_id
                            AND counted.superseded_at IS NULL
                      )
                ) credentials ON TRUE
                WHERE sources.connection_uuid IS NULL
                ORDER BY sources.project_dbt_source_uuid
                LIMIT ?
            )
            UPDATE project_dbt_sources sources
            SET connection_uuid = batch.warehouse_credentials_uuid
            FROM batch
            WHERE sources.project_dbt_source_uuid = batch.project_dbt_source_uuid`,
            [BATCH_SIZE],
        )
        .connection(connection);
    const updated = result.rowCount ?? 0;
    if (updated > 0) {
        report(`Backfilled ${total + updated} dbt source connection bindings`);
        await backfillSourceConnections(knex, connection, total + updated);
    }
};

const materializePrimarySources = async (
    knex: Knex,
    connection: unknown,
    total = 0,
): Promise<void> => {
    const result = await knex
        .raw<{ rowCount: number }>(
            `WITH batch AS (
                SELECT
                    projects.project_uuid,
                    projects.dbt_source_uuid,
                    projects.dbt_source_name,
                    projects.dbt_connection_type,
                    projects.dbt_connection,
                    credentials.warehouse_credentials_uuid
                FROM projects
                JOIN LATERAL (
                    SELECT warehouse_credentials_uuid
                    FROM warehouse_credentials candidate
                    WHERE candidate.project_id = projects.project_id
                      AND candidate.superseded_at IS NULL
                      AND 1 = (
                          SELECT count(*)
                          FROM warehouse_credentials counted
                          WHERE counted.project_id = projects.project_id
                            AND counted.superseded_at IS NULL
                      )
                ) credentials ON TRUE
                WHERE projects.dbt_connection IS NOT NULL
                  AND projects.dbt_source_uuid IS NOT NULL
                  AND NOT EXISTS (
                      SELECT 1
                      FROM project_dbt_sources sources
                      WHERE sources.project_uuid = projects.project_uuid
                        AND sources.is_primary
                  )
                ORDER BY projects.project_uuid
                LIMIT ?
            )
            INSERT INTO project_dbt_sources (
                project_dbt_source_uuid,
                project_uuid,
                connection_uuid,
                namespace_prefix,
                name,
                is_primary,
                precedence,
                dbt_connection_type,
                dbt_connection,
                warehouse_database,
                warehouse_schema
            )
            SELECT
                dbt_source_uuid,
                project_uuid,
                warehouse_credentials_uuid,
                '',
                dbt_source_name,
                TRUE,
                0,
                dbt_connection_type,
                dbt_connection,
                NULL,
                NULL
            FROM batch
            ON CONFLICT DO NOTHING`,
            [BATCH_SIZE],
        )
        .connection(connection);
    const inserted = result.rowCount ?? 0;
    if (inserted > 0) {
        report(`Materialised ${total + inserted} primary dbt sources`);
        await materializePrimarySources(knex, connection, total + inserted);
    }
};

const backfillNamespacePrefixes = async (
    knex: Knex,
    connection: unknown,
    total = 0,
): Promise<void> => {
    const result = await knex
        .raw<{ rowCount: number }>(
            `WITH batch AS (
                SELECT project_dbt_source_uuid
                FROM project_dbt_sources
                WHERE NOT is_primary
                  AND namespace_prefix = ''
                  AND namespace_prefix IS DISTINCT FROM name
                ORDER BY project_dbt_source_uuid
                LIMIT ?
            )
            UPDATE project_dbt_sources sources
            SET namespace_prefix = sources.name
            FROM batch
            WHERE sources.project_dbt_source_uuid = batch.project_dbt_source_uuid
              AND sources.namespace_prefix = ''
              AND sources.namespace_prefix IS DISTINCT FROM sources.name`,
            [BATCH_SIZE],
        )
        .connection(connection);
    const updated = result.rowCount ?? 0;
    if (updated > 0) {
        report(`Backfilled ${total + updated} dbt source namespace prefixes`);
        await backfillNamespacePrefixes(knex, connection, total + updated);
    }
};

export async function up(knex: Knex): Promise<void> {
    const connection = await knex.client.acquireConnection();
    try {
        await knex.raw('SET statement_timeout = 0').connection(connection);
        await knex.raw("SET lock_timeout = '5s'").connection(connection);
        await knex
            .raw(
                `ALTER TABLE project_dbt_sources
                 ADD COLUMN IF NOT EXISTS connection_uuid uuid NULL,
                 ADD COLUMN IF NOT EXISTS namespace_prefix text NOT NULL DEFAULT ''`,
            )
            .connection(connection);
        await knex
            .raw(
                `DO $$ BEGIN
                    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_dbt_sources_connection_uuid_fkey' AND conrelid = 'project_dbt_sources'::regclass) THEN
                        ALTER TABLE project_dbt_sources ADD CONSTRAINT project_dbt_sources_connection_uuid_fkey FOREIGN KEY (connection_uuid) REFERENCES warehouse_credentials(warehouse_credentials_uuid) ON DELETE RESTRICT NOT VALID;
                    END IF;
                END $$`,
            )
            .connection(connection);

        await backfillSourceConnections(knex, connection);
        await backfillNamespacePrefixes(knex, connection);
        await materializePrimarySources(knex, connection);

        await knex
            .raw(
                `ALTER TABLE project_dbt_sources VALIDATE CONSTRAINT project_dbt_sources_connection_uuid_fkey`,
            )
            .connection(connection);

        await knex
            .raw(
                `DO $$ BEGIN
                    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${SOURCE_CONNECTION_CHECK}' AND conrelid = 'project_dbt_sources'::regclass) THEN
                        ALTER TABLE project_dbt_sources ADD CONSTRAINT ${SOURCE_CONNECTION_CHECK} CHECK (connection_uuid IS NOT NULL) NOT VALID;
                    END IF;
                END $$`,
            )
            .connection(connection);
        await knex
            .raw(
                `ALTER TABLE project_dbt_sources VALIDATE CONSTRAINT ${SOURCE_CONNECTION_CHECK}`,
            )
            .connection(connection);
        await runDdl(
            knex,
            connection,
            'ALTER TABLE project_dbt_sources ALTER COLUMN connection_uuid SET NOT NULL',
        );
        await knex
            .raw(
                `ALTER TABLE project_dbt_sources DROP CONSTRAINT IF EXISTS ${SOURCE_CONNECTION_CHECK}`,
            )
            .connection(connection);

        await createSourceConnectionIndex(knex, connection);
    } finally {
        try {
            await knex.raw('RESET lock_timeout').connection(connection);
            await knex.raw('RESET statement_timeout').connection(connection);
        } finally {
            await knex.client.releaseConnection(connection);
        }
    }
}

export async function down(knex: Knex): Promise<void> {
    const connection = await knex.client.acquireConnection();
    try {
        await knex.raw('SET statement_timeout = 0').connection(connection);
        await knex.raw("SET lock_timeout = '5s'").connection(connection);
        await knex
            .raw(
                'DROP INDEX CONCURRENTLY IF EXISTS project_dbt_sources_connection_uuid_idx',
            )
            .connection(connection);
        await knex
            .raw(
                `ALTER TABLE project_dbt_sources
                 DROP CONSTRAINT IF EXISTS ${SOURCE_CONNECTION_CHECK},
                 DROP CONSTRAINT IF EXISTS project_dbt_sources_connection_uuid_fkey`,
            )
            .connection(connection);
        await knex
            .raw(
                `DO $$ BEGIN
                    IF EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = current_schema()
                          AND table_name = 'project_dbt_sources'
                          AND column_name = 'connection_uuid'
                    ) THEN
                        ALTER TABLE project_dbt_sources ALTER COLUMN connection_uuid DROP NOT NULL;
                    END IF;
                END $$`,
            )
            .connection(connection);
    } finally {
        try {
            await knex.raw('RESET lock_timeout').connection(connection);
            await knex.raw('RESET statement_timeout').connection(connection);
        } finally {
            await knex.client.releaseConnection(connection);
        }
    }
}
