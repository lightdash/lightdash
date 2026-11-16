import { type Knex } from 'knex';

export const config = { transaction: false };
export const classification = {
    kind: 'safe',
    reason: 'Adds a cleanup ledger and nullable/defaulted attachment columns. Existing text rows and readers remain valid. The new foreign key and shape check are validated without blocking reads; the existing-table index is concurrent.',
};

// Session settings and DDL must share one connection; the pool hands out others.
const withSession = async (
    knex: Knex,
    migrate: (
        run: (sql: string) => Promise<{ rows: unknown[] }>,
    ) => Promise<void>,
): Promise<void> => {
    const connection: unknown = await knex.client.acquireConnection();
    const run = (sql: string): Promise<{ rows: unknown[] }> =>
        knex.raw<{ rows: unknown[] }>(sql).connection(connection);
    try {
        await run(`SET lock_timeout = '60s'`);
        await run('SET statement_timeout = 0');
        await migrate(run);
    } finally {
        try {
            await run('RESET statement_timeout');
            await run('RESET lock_timeout');
        } finally {
            await knex.client.releaseConnection(connection);
        }
    }
};

export async function up(knex: Knex): Promise<void> {
    await withSession(knex, async (run) => {
        await run(`CREATE TABLE IF NOT EXISTS ai_thread_image_object (
            storage_key text PRIMARY KEY,
            -- No tenant FK: object cleanup must survive tenant deletion.
            organization_uuid uuid NOT NULL,
            media_type text NOT NULL
                CHECK (media_type IN ('image/png', 'image/jpeg', 'image/webp')),
            width integer NOT NULL CHECK (width BETWEEN 1 AND 2560),
            height integer NOT NULL CHECK (height BETWEEN 1 AND 2560),
            size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 3145728),
            created_at timestamptz NOT NULL,
            uploaded_at timestamptz,
            cleanup_attempted_at timestamptz
        )`);
        await run(`CREATE INDEX IF NOT EXISTS ai_thread_image_object_cleanup_attempt
            ON ai_thread_image_object (cleanup_attempted_at ASC NULLS FIRST, created_at)`);
        await run(`ALTER TABLE ai_thread_file
            ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'text',
            ADD COLUMN IF NOT EXISTS storage_key text`);
        const invalidIndexes = await run(`SELECT 1 FROM pg_index
            JOIN pg_class ON pg_class.oid = pg_index.indexrelid
            WHERE pg_class.relname = 'ai_thread_file_storage_key_unique'
              AND NOT pg_index.indisvalid`);
        if (invalidIndexes.rows.length > 0) {
            await run(
                'DROP INDEX CONCURRENTLY IF EXISTS ai_thread_file_storage_key_unique',
            );
        }
        await run(`CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ai_thread_file_storage_key_unique
            ON ai_thread_file (storage_key)`);
        await run(`DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_thread_file_image_object_fk' AND conrelid = 'ai_thread_file'::regclass) THEN
                ALTER TABLE ai_thread_file ADD CONSTRAINT ai_thread_file_image_object_fk
                    FOREIGN KEY (storage_key) REFERENCES ai_thread_image_object(storage_key) ON DELETE RESTRICT NOT VALID;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_thread_file_kind_shape' AND conrelid = 'ai_thread_file'::regclass) THEN
                ALTER TABLE ai_thread_file ADD CONSTRAINT ai_thread_file_kind_shape CHECK (
                    (kind = 'text' AND storage_key IS NULL) OR
                    (kind = 'image' AND storage_key IS NOT NULL AND content = '')
                ) NOT VALID;
            END IF;
        END $$`);
        console.log('Validating AI thread image attachment constraints');
        await run(
            'ALTER TABLE ai_thread_file VALIDATE CONSTRAINT ai_thread_file_image_object_fk',
        );
        await run(
            'ALTER TABLE ai_thread_file VALIDATE CONSTRAINT ai_thread_file_kind_shape',
        );
    });
}

export async function down(knex: Knex): Promise<void> {
    await withSession(knex, async (run) => {
        const table = await run(
            `SELECT 1 WHERE to_regclass('ai_thread_image_object') IS NOT NULL`,
        );
        if (table.rows.length > 0) {
            const objects = await run(
                'SELECT 1 FROM ai_thread_image_object LIMIT 1',
            );
            if (objects.rows.length > 0) {
                throw new Error(
                    'irreversible: image objects must be cleaned up before removing their ledger',
                );
            }
        }
        await run(`ALTER TABLE ai_thread_file
            DROP CONSTRAINT IF EXISTS ai_thread_file_kind_shape,
            DROP CONSTRAINT IF EXISTS ai_thread_file_image_object_fk`);
        await run(
            'DROP INDEX CONCURRENTLY IF EXISTS ai_thread_file_storage_key_unique',
        );
        await run(`ALTER TABLE ai_thread_file
            DROP COLUMN IF EXISTS storage_key, DROP COLUMN IF EXISTS kind`);
        await run('DROP TABLE IF EXISTS ai_thread_image_object');
    });
}
