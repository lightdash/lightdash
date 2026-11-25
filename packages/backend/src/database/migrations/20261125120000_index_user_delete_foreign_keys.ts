import { Knex } from 'knex';

export const config = { transaction: false };

export const classification = {
    kind: 'safe',
    reason: 'Builds secondary indexes on foreign key columns concurrently; no lock that blocks reads or writes, no table rewrite, and older app versions keep working.',
};

const Indexes = [
    {
        name: 'saved_queries_versions_updated_by_user_uuid_index',
        table: 'saved_queries_versions',
        columns: 'updated_by_user_uuid',
    },
    {
        name: 'project_compile_log_user_uuid_index',
        table: 'project_compile_log',
        columns: 'user_uuid',
    },
    {
        name: 'group_memberships_user_id_organization_id_index',
        table: 'group_memberships',
        columns: 'user_id, organization_id',
    },
    {
        name: 'saved_queries_last_version_updated_by_user_uuid_index',
        table: 'saved_queries',
        columns: 'last_version_updated_by_user_uuid',
    },
    {
        name: 'analytics_app_views_user_uuid_index',
        table: 'analytics_app_views',
        columns: 'user_uuid',
    },
    {
        name: 'saved_sql_versions_created_by_user_uuid_index',
        table: 'saved_sql_versions',
        columns: 'created_by_user_uuid',
    },
    {
        name: 'saved_sql_created_by_user_uuid_index',
        table: 'saved_sql',
        columns: 'created_by_user_uuid',
    },
    {
        name: 'persistent_download_files_created_by_user_uuid_index',
        table: 'persistent_download_files',
        columns: 'created_by_user_uuid',
    },
    {
        name: 'spaces_created_by_user_id_index',
        table: 'spaces',
        columns: 'created_by_user_id',
    },
    {
        name: 'changes_created_by_user_uuid_index',
        table: 'changes',
        columns: 'created_by_user_uuid',
    },
    {
        name: 'emails_user_id_index',
        table: 'emails',
        columns: 'user_id',
    },
    {
        name: 'dashboard_tile_comments_reply_to_index',
        table: 'dashboard_tile_comments',
        columns: 'reply_to',
    },
    {
        name: 'scheduler_email_target_scheduler_uuid_index',
        table: 'scheduler_email_target',
        columns: 'scheduler_uuid',
    },
    {
        name: 'scheduler_slack_target_scheduler_uuid_index',
        table: 'scheduler_slack_target',
        columns: 'scheduler_uuid',
    },
    {
        name: 'scheduler_msteams_target_scheduler_uuid_index',
        table: 'scheduler_msteams_target',
        columns: 'scheduler_uuid',
    },
    {
        name: 'scheduler_google_chat_target_scheduler_uuid_index',
        table: 'scheduler_google_chat_target',
        columns: 'scheduler_uuid',
    },
] as const;

const logProgress = (message: string): void => {
    console.log(`  user delete foreign key indexes: ${message}`);
};

const withConcurrentIndexSession = async (
    knex: Knex,
    run: (connection: unknown) => Promise<void>,
): Promise<void> => {
    const connection = await knex.client.acquireConnection();
    try {
        const {
            rows: [settings],
        } = await knex
            .raw<{
                rows: { statement_timeout: string; lock_timeout: string }[];
            }>(
                "SELECT current_setting('statement_timeout') AS statement_timeout, current_setting('lock_timeout') AS lock_timeout",
            )
            .connection(connection);
        if (!settings)
            throw new Error('Could not read index migration timeouts');
        try {
            await knex.raw('SET statement_timeout = 0').connection(connection);
            await knex.raw('SET lock_timeout = 0').connection(connection);
            await run(connection);
        } finally {
            await knex
                .raw(
                    "SELECT set_config('statement_timeout', ?, false), set_config('lock_timeout', ?, false)",
                    [settings.statement_timeout, settings.lock_timeout],
                )
                .connection(connection);
        }
    } finally {
        await knex.client.releaseConnection(connection);
    }
};

export async function up(knex: Knex): Promise<void> {
    await withConcurrentIndexSession(knex, async (connection) => {
        for (const { name, table, columns } of Indexes) {
            // eslint-disable-next-line no-await-in-loop
            const invalidIndex = await knex
                .raw<{ rowCount: number }>(
                    `SELECT 1
                     FROM pg_class
                     JOIN pg_index ON pg_index.indexrelid = pg_class.oid
                     WHERE pg_class.relname = ?
                       AND pg_index.indrelid = ?::regclass
                       AND NOT pg_index.indisvalid`,
                    [name, table],
                )
                .connection(connection);
            if ((invalidIndex.rowCount ?? 0) > 0) {
                logProgress(`dropping invalid ${name} from a prior run`);
                // eslint-disable-next-line no-await-in-loop
                await knex
                    .raw(`DROP INDEX CONCURRENTLY IF EXISTS ${name}`)
                    .connection(connection);
            }
            logProgress(`building ${name}`);
            // eslint-disable-next-line no-await-in-loop
            await knex
                .raw(
                    `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${name} ON ${table} (${columns})`,
                )
                .connection(connection);
        }
    });
}

export async function down(knex: Knex): Promise<void> {
    await withConcurrentIndexSession(knex, async (connection) => {
        for (const { name } of Indexes) {
            // eslint-disable-next-line no-await-in-loop
            await knex
                .raw(`DROP INDEX CONCURRENTLY IF EXISTS ${name}`)
                .connection(connection);
        }
    });
}
