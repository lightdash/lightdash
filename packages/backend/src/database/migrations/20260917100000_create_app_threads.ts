import type { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Creates app_threads, adds a nullable app_versions.app_thread_uuid column, and backfills thread 1 per app with ON CONFLICT DO NOTHING inserts and bounded batched updates',
} as const;

export const config = { transaction: false };

const threadsTable = 'app_threads';
const versionsTable = 'app_versions';
const versionThreadIndex = 'app_versions_app_thread_uuid_index';
const BACKFILL_BATCH_SIZE = 10000;

const dropInvalidIndex = async (knex: Knex): Promise<void> => {
    const invalid = await knex.raw(
        `SELECT 1 FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid WHERE c.relname = '${versionThreadIndex}' AND NOT i.indisvalid`,
    );
    if (invalid.rows.length > 0) {
        await knex.raw(
            `DROP INDEX CONCURRENTLY IF EXISTS ${versionThreadIndex}`,
        );
    }
};

// Idempotent via the unique (app_id, thread_number) index; a NOT EXISTS guard goes
// quadratic when the planner sees app_threads as empty. Exported for the integration tests.
export const backfillThreadOne = async (
    knex: Knex,
): Promise<{ threadsInserted: number; versionsAttached: number }> => {
    const inserted = await knex.raw(
        `INSERT INTO ${threadsTable} (app_id, thread_number, origin, coding_agent, created_at, created_by_user_uuid)
         SELECT a.app_id, 1, 'builder', 'claude', a.created_at, a.created_by_user_uuid
         FROM apps a
         ON CONFLICT (app_id, thread_number) DO NOTHING`,
    );

    let versionsAttached = 0;
    for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const batch = await knex.raw(
            `UPDATE ${versionsTable} v
             SET app_thread_uuid = t.app_thread_uuid
             FROM ${threadsTable} t
             WHERE t.app_id = v.app_id AND t.thread_number = 1
               AND v.ctid IN (
                   SELECT v2.ctid FROM ${versionsTable} v2
                   JOIN ${threadsTable} t2 ON t2.app_id = v2.app_id AND t2.thread_number = 1
                   WHERE v2.app_thread_uuid IS NULL
                   LIMIT ${BACKFILL_BATCH_SIZE}
               )`,
        );
        if (batch.rowCount === 0) break;
        versionsAttached += batch.rowCount;
    }
    return { threadsInserted: inserted.rowCount, versionsAttached };
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw('SET statement_timeout = 0');
    try {
        await knex.raw(`SET lock_timeout = '5s'`);
        if (!(await knex.schema.hasTable(threadsTable))) {
            await knex.schema.createTable(threadsTable, (table) => {
                table
                    .uuid('app_thread_uuid')
                    .primary()
                    .defaultTo(knex.raw('uuid_generate_v4()'));
                table
                    .uuid('app_id')
                    .notNullable()
                    .references('app_id')
                    .inTable('apps')
                    .onDelete('CASCADE')
                    .index();
                table.integer('thread_number').notNullable();
                // 'builder' | 'ai_thread' | 'import'
                table.text('origin').notNullable();
                // Ask AI thread that created the app; no FK because ai_thread
                // is an EE table and this migration is OSS.
                table.uuid('ai_thread_uuid').nullable().index();
                // 'claude' | 'codex'
                table.text('coding_agent').notNullable();
                table.text('coding_agent_session_id').nullable();
                table
                    .timestamp('created_at', { useTz: false })
                    .notNullable()
                    .defaultTo(knex.fn.now());
                table.uuid('created_by_user_uuid').notNullable();
                table.unique(['app_id', 'thread_number']);
            });
        }
        await knex.raw(
            `ALTER TABLE ${versionsTable} ADD COLUMN IF NOT EXISTS app_thread_uuid UUID NULL REFERENCES ${threadsTable}(app_thread_uuid) ON DELETE SET NULL`,
        );
        await knex.raw('RESET lock_timeout');

        await dropInvalidIndex(knex);
        await knex.raw(
            `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${versionThreadIndex} ON ${versionsTable} (app_thread_uuid)`,
        );

        console.log(`${threadsTable}: backfilling thread 1 for existing apps`);
        const { threadsInserted, versionsAttached } =
            await backfillThreadOne(knex);
        console.log(
            `${threadsTable}: inserted ${threadsInserted} threads, attached ${versionsAttached} versions`,
        );
    } finally {
        await knex.raw('RESET statement_timeout');
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw('SET statement_timeout = 0');
    try {
        await knex.raw(`SET lock_timeout = '5s'`);
        await knex.raw(
            `DROP INDEX CONCURRENTLY IF EXISTS ${versionThreadIndex}`,
        );
        await knex.raw(
            `ALTER TABLE ${versionsTable} DROP COLUMN IF EXISTS app_thread_uuid`,
        );
        await knex.raw(`DROP TABLE IF EXISTS ${threadsTable}`);
    } finally {
        await knex.raw('RESET statement_timeout');
        await knex.raw('RESET lock_timeout');
    }
}
