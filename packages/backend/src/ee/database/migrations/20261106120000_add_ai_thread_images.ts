import { type Knex } from 'knex';

const ImageObjectTable = 'ai_thread_image_object';
const ThreadFileTable = 'ai_thread_file';

export const config = { transaction: false };
export const classification = {
    kind: 'safe',
    reason: 'Adds a cleanup ledger and nullable/defaulted attachment columns. Existing text rows and readers remain valid. The new foreign key and shape check are validated without blocking reads; the existing-table index is concurrent.',
};

type Session = {
    schema: () => Knex.SchemaBuilder;
    query: (table: string) => Knex.QueryBuilder;
    run: (sql: string) => Promise<{ rows: unknown[] }>;
};

// Session settings and DDL must share one connection; the pool hands out others.
const withSession = async (
    knex: Knex,
    migrate: (session: Session) => Promise<void>,
): Promise<void> => {
    const connection: unknown = await knex.client.acquireConnection();
    const session: Session = {
        schema: () => knex.schema.connection(connection),
        query: (table) => knex(table).connection(connection),
        run: (sql) => knex.raw<{ rows: unknown[] }>(sql).connection(connection),
    };
    try {
        await session.run(`SET lock_timeout = '60s'`);
        await session.run('SET statement_timeout = 0');
        await migrate(session);
    } finally {
        try {
            await session.run('RESET statement_timeout');
            await session.run('RESET lock_timeout');
        } finally {
            await knex.client.releaseConnection(connection);
        }
    }
};

export async function up(knex: Knex): Promise<void> {
    await withSession(knex, async ({ schema, run }) => {
        if (!(await schema().hasTable(ImageObjectTable))) {
            await schema().createTable(ImageObjectTable, (table) => {
                table.text('storage_key').primary();
                // No tenant FK: object cleanup must survive tenant deletion.
                table.uuid('organization_uuid').notNullable();
                table.text('media_type').notNullable();
                table.integer('width').notNullable();
                table.integer('height').notNullable();
                table.integer('size_bytes').notNullable();
                table.timestamp('created_at', { useTz: true }).notNullable();
                table.timestamp('uploaded_at', { useTz: true });
                table.timestamp('cleanup_attempted_at', { useTz: true });
            });
        }
        // Knex cannot order an index NULLS FIRST, which the cleanup query sorts by.
        await run(`CREATE INDEX IF NOT EXISTS ai_thread_image_object_cleanup_attempt
            ON ai_thread_image_object (cleanup_attempted_at ASC NULLS FIRST, created_at)`);
        if (!(await schema().hasColumn(ThreadFileTable, 'kind'))) {
            await schema().alterTable(ThreadFileTable, (table) => {
                table.text('kind').notNullable().defaultTo('text');
            });
        }
        if (!(await schema().hasColumn(ThreadFileTable, 'storage_key'))) {
            await schema().alterTable(ThreadFileTable, (table) => {
                table.text('storage_key');
            });
        }
        // Knex has no concurrent index build or NOT VALID constraint, so the
        // steps that must not block writes on the existing table stay raw.
        const invalidIndexes = await run(`SELECT 1 FROM pg_index
            JOIN pg_class ON pg_class.oid = pg_index.indexrelid
            WHERE pg_class.relname = 'ai_thread_file_storage_key_unique'
              AND NOT pg_index.indisvalid`);
        if (invalidIndexes.rows.length > 0) {
            await run(
                `DROP INDEX CONCURRENTLY IF EXISTS ai_thread_file_storage_key_unique`,
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
        await run(
            `ALTER TABLE ai_thread_file VALIDATE CONSTRAINT ai_thread_file_image_object_fk`,
        );
        await run(
            `ALTER TABLE ai_thread_file VALIDATE CONSTRAINT ai_thread_file_kind_shape`,
        );
    });
}

export async function down(knex: Knex): Promise<void> {
    await withSession(knex, async ({ schema, query, run }) => {
        if (await schema().hasTable(ImageObjectTable)) {
            const object = await query(ImageObjectTable).first('storage_key');
            if (object !== undefined) {
                throw new Error(
                    'irreversible: image objects must be cleaned up before removing their ledger',
                );
            }
        }
        await run(`ALTER TABLE ai_thread_file
            DROP CONSTRAINT IF EXISTS ai_thread_file_kind_shape,
            DROP CONSTRAINT IF EXISTS ai_thread_file_image_object_fk`);
        await run(
            `DROP INDEX CONCURRENTLY IF EXISTS ai_thread_file_storage_key_unique`,
        );
        if (await schema().hasColumn(ThreadFileTable, 'storage_key')) {
            await schema().alterTable(ThreadFileTable, (table) => {
                table.dropColumn('storage_key');
            });
        }
        if (await schema().hasColumn(ThreadFileTable, 'kind')) {
            await schema().alterTable(ThreadFileTable, (table) => {
                table.dropColumn('kind');
            });
        }
        await schema().dropTableIfExists(ImageObjectTable);
    });
}
