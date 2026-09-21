import type { Knex } from 'knex';

export const config = { transaction: false };

export const classification = {
    kind: 'safe',
    reason: 'Validates universal source bindings from an earlier release before making the connection identity required.',
} as const;

const SOURCE_CONNECTION_CHECK = 'project_dbt_sources_connection_uuid_not_null';

type UnboundSourceSummary = {
    unbound_source_count: number;
    unbound_project_count: number;
    zero_connection_project_count: number;
    multiple_connection_project_count: number;
    sample_project_uuids: string[];
};

const report = (message: string) => process.stdout.write(`${message}\n`);

const countLabel = (count: number, singular: string) =>
    `${count} ${singular}${count === 1 ? '' : 's'}`;

const countVerb = (count: number, singular: string, plural: string) =>
    count === 1 ? singular : plural;

const assertNoUnboundSources = async (
    knex: Knex,
    connection: unknown,
): Promise<void> => {
    const result = await knex
        .raw<{ rows: UnboundSourceSummary[] }>(
            `WITH unbound_projects AS (
                SELECT DISTINCT project_uuid
                FROM project_dbt_sources
                WHERE connection_uuid IS NULL
            ), active_connection_counts AS (
                SELECT
                    unbound_projects.project_uuid,
                    count(warehouse_credentials.warehouse_credentials_uuid)
                        FILTER (WHERE warehouse_credentials.superseded_at IS NULL)::integer AS active_connection_count
                FROM unbound_projects
                LEFT JOIN projects
                    ON projects.project_uuid = unbound_projects.project_uuid
                LEFT JOIN warehouse_credentials
                    ON warehouse_credentials.project_id = projects.project_id
                GROUP BY unbound_projects.project_uuid
            )
            SELECT
                (SELECT count(*)::integer
                 FROM project_dbt_sources
                 WHERE connection_uuid IS NULL) AS unbound_source_count,
                count(*)::integer AS unbound_project_count,
                count(*) FILTER (WHERE active_connection_count = 0)::integer AS zero_connection_project_count,
                count(*) FILTER (WHERE active_connection_count > 1)::integer AS multiple_connection_project_count,
                COALESCE(
                    (SELECT array_agg(project_uuid ORDER BY project_uuid)
                     FROM (
                         SELECT project_uuid
                         FROM unbound_projects
                         ORDER BY project_uuid
                         LIMIT 10
                     ) sample_projects),
                    ARRAY[]::uuid[]
                ) AS sample_project_uuids
            FROM active_connection_counts`,
        )
        .connection(connection);
    const summary = result.rows[0];
    if (summary.unbound_source_count === 0) {
        return;
    }

    throw new Error(
        `Cannot enforce project_dbt_sources.connection_uuid NOT NULL: ${countLabel(summary.unbound_source_count, 'unbound source row')} ${countVerb(summary.unbound_source_count, 'remains', 'remain')} across ${countLabel(summary.unbound_project_count, 'project')}. ${countLabel(summary.zero_connection_project_count, 'project')} ${countVerb(summary.zero_connection_project_count, 'has', 'have')} no active connection and ${countLabel(summary.multiple_connection_project_count, 'project')} ${countVerb(summary.multiple_connection_project_count, 'has', 'have')} more than one active connection. Give each affected project exactly one active connection, bind every source, and retry this migration. The migration will not create connections or delete sources. Sample project UUIDs: ${summary.sample_project_uuids.join(', ')}.`,
    );
};

export async function up(knex: Knex): Promise<void> {
    const connection = await knex.client.acquireConnection();
    try {
        await knex.raw('SET statement_timeout = 0').connection(connection);
        await knex.raw("SET lock_timeout = '5s'").connection(connection);

        await assertNoUnboundSources(knex, connection);

        report('Adding the dbt source connection not-null check');
        await knex
            .raw(
                `DO $$ BEGIN
                    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${SOURCE_CONNECTION_CHECK}' AND conrelid = 'project_dbt_sources'::regclass) THEN
                        ALTER TABLE project_dbt_sources ADD CONSTRAINT ${SOURCE_CONNECTION_CHECK} CHECK (connection_uuid IS NOT NULL) NOT VALID;
                    END IF;
                END $$`,
            )
            .connection(connection);

        report('Validating the dbt source connection not-null check');
        await knex
            .raw(
                `ALTER TABLE project_dbt_sources VALIDATE CONSTRAINT ${SOURCE_CONNECTION_CHECK}`,
            )
            .connection(connection);

        report('Requiring every dbt source to have a connection');
        await knex
            .raw(
                'ALTER TABLE project_dbt_sources ALTER COLUMN connection_uuid SET NOT NULL',
            )
            .connection(connection);

        await knex
            .raw(
                `ALTER TABLE project_dbt_sources DROP CONSTRAINT IF EXISTS ${SOURCE_CONNECTION_CHECK}`,
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

export async function down(knex: Knex): Promise<void> {
    const connection = await knex.client.acquireConnection();
    try {
        await knex.raw('SET statement_timeout = 0').connection(connection);
        await knex.raw("SET lock_timeout = '5s'").connection(connection);
        await knex
            .raw(
                `ALTER TABLE project_dbt_sources DROP CONSTRAINT IF EXISTS ${SOURCE_CONNECTION_CHECK}`,
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
