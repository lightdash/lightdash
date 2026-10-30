import { type Knex } from 'knex';

export const config = { transaction: false };
export const classification = {
    kind: 'safe',
    reason: 'Adds a cleanup ledger and nullable/defaulted attachment columns. Existing text rows and readers remain valid. The new foreign key and shape check are validated without blocking reads; the existing-table index is concurrent.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    await knex.raw('SET statement_timeout = 0');
    try {
        if (!(await knex.schema.hasTable('ai_thread_image_object'))) {
            await knex.schema.createTable('ai_thread_image_object', (table) => {
                table.text('storage_key').primary();
                // No tenant FK: object cleanup must survive tenant deletion.
                table.uuid('organization_uuid').notNullable();
                table.text('media_type').notNullable();
                table.integer('width').notNullable();
                table.integer('height').notNullable();
                table.integer('size_bytes').notNullable();
                table.timestamp('created_at', { useTz: true }).notNullable();
                table.timestamp('uploaded_at', { useTz: true }).nullable();
                table
                    .timestamp('cleanup_attempted_at', { useTz: true })
                    .nullable();
                table.timestamp('expires_at', { useTz: true }).notNullable();
                table
                    .timestamp('object_deleted_at', { useTz: true })
                    .nullable();
                table.check(
                    "media_type IN ('image/png', 'image/jpeg', 'image/webp')",
                );
                table.check(
                    'width BETWEEN 1 AND 2560 AND height BETWEEN 1 AND 2560',
                );
                table.check('size_bytes BETWEEN 1 AND 3145728');
                table.check('expires_at > created_at');
            });
        }
        await knex.raw(`CREATE INDEX IF NOT EXISTS ai_thread_image_object_expiry
            ON ai_thread_image_object (expires_at) WHERE object_deleted_at IS NULL`);
        await knex.raw(`CREATE INDEX IF NOT EXISTS ai_thread_image_object_created
            ON ai_thread_image_object (created_at)`);
        await knex.raw(`CREATE INDEX IF NOT EXISTS ai_thread_image_object_cleanup_attempt
            ON ai_thread_image_object (cleanup_attempted_at ASC NULLS FIRST, created_at)`);
        await knex.raw(`ALTER TABLE ai_thread_file
            ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'text',
            ADD COLUMN IF NOT EXISTS storage_key text`);
        const invalidIndexes = await knex('pg_index')
            .join('pg_class', 'pg_class.oid', 'pg_index.indexrelid')
            .where('pg_class.relname', 'ai_thread_file_storage_key_unique')
            .where('pg_index.indisvalid', false)
            .select('pg_class.relname');
        if (invalidIndexes.length > 0) {
            await knex.raw(
                'DROP INDEX CONCURRENTLY IF EXISTS ai_thread_file_storage_key_unique',
            );
        }
        await knex.raw(`CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ai_thread_file_storage_key_unique
            ON ai_thread_file (storage_key)`);
        await knex.raw(`DO $$ BEGIN
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
        await knex.raw(
            'ALTER TABLE ai_thread_file VALIDATE CONSTRAINT ai_thread_file_image_object_fk',
        );
        await knex.raw(
            'ALTER TABLE ai_thread_file VALIDATE CONSTRAINT ai_thread_file_kind_shape',
        );
    } finally {
        await knex.raw('RESET statement_timeout');
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        if (await knex.schema.hasTable('ai_thread_image_object')) {
            const object = await knex('ai_thread_image_object').first(
                'storage_key',
            );
            if (object) {
                throw new Error(
                    'irreversible: image objects must be cleaned up before removing their ledger',
                );
            }
        }
        await knex.raw(`ALTER TABLE ai_thread_file
            DROP CONSTRAINT IF EXISTS ai_thread_file_kind_shape,
            DROP CONSTRAINT IF EXISTS ai_thread_file_image_object_fk`);
        await knex.raw(
            'DROP INDEX CONCURRENTLY IF EXISTS ai_thread_file_storage_key_unique',
        );
        await knex.raw(`ALTER TABLE ai_thread_file
            DROP COLUMN IF EXISTS storage_key, DROP COLUMN IF EXISTS kind`);
        await knex.schema.dropTableIfExists('ai_thread_image_object');
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
