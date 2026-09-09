/* eslint-disable no-await-in-loop -- Backfill batches must commit sequentially. */
import type { Knex } from 'knex';

type BackfillRow = { cached_explore_uuid: string; search_metadata: unknown };

export const config = { transaction: false };

export const classification = {
    kind: 'safe',
    reason: 'Adds derived explore search metadata, maintained for existing writers by a trigger, with a resumable batched backfill.',
};

export async function up(knex: Knex): Promise<void> {
    // Pin the connection so session timeouts also apply to the backfill.
    const connection = await knex.client.acquireConnection();
    try {
        await knex.raw('SET statement_timeout = 0').connection(connection);
        await knex.raw("SET lock_timeout = '5s'").connection(connection);

        await knex
            .raw(`
            CREATE OR REPLACE FUNCTION cached_explore_search_fields(fields jsonb)
            RETURNS jsonb LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
                SELECT COALESCE(jsonb_object_agg(field.key, (
                    SELECT jsonb_object_agg(property.key, property.value)
                    FROM jsonb_each(field.value) property
                    WHERE property.key IN (
                        'name', 'label', 'description', 'type', 'fieldType',
                        'table', 'tableLabel', 'hidden', 'requiredAttributes',
                        'anyAttributes', 'tablesRequiredAttributes', 'tablesAnyAttributes'
                    )
                )), '{}'::jsonb)
                FROM jsonb_each(fields) field
            $$
        `)
            .connection(connection);

        // Preserve property presence and nested permission maps exactly. In particular,
        // recursive jsonb_strip_nulls would change the meaning of stored attributes.
        await knex
            .raw(`
            CREATE OR REPLACE FUNCTION cached_explore_search_metadata(source jsonb)
            RETURNS jsonb LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
                SELECT (
                    SELECT jsonb_object_agg(property.key, property.value)
                    FROM jsonb_each(source) property
                    WHERE property.key IN ('name', 'label', 'tags', 'type', 'errors')
                ) || jsonb_build_object('tables',
                    CASE WHEN jsonb_exists(source, 'errors') THEN '{}'::jsonb
                    ELSE COALESCE((
                        SELECT jsonb_object_agg(table_entry.key, (
                            SELECT jsonb_object_agg(property.key, property.value)
                            FROM jsonb_each(table_entry.value) property
                            WHERE property.key IN (
                                'name', 'label', 'description', 'requiredAttributes', 'anyAttributes'
                            )
                        ) || jsonb_build_object(
                            'dimensions', cached_explore_search_fields(table_entry.value->'dimensions'),
                            'metrics', cached_explore_search_fields(table_entry.value->'metrics')
                        ))
                        FROM jsonb_each(source->'tables') table_entry
                    ), '{}'::jsonb) END
                )
            $$
        `)
            .connection(connection);

        await knex
            .raw(`
            ALTER TABLE cached_explore ADD COLUMN IF NOT EXISTS search_metadata jsonb
        `)
            .connection(connection);
        await knex
            .raw(`
            CREATE OR REPLACE FUNCTION update_cached_explore_search_metadata()
            RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
                NEW.search_metadata := cached_explore_search_metadata(NEW.explore);
                RETURN NEW;
            END
            $$
        `)
            .connection(connection);
        // A regular column also supports older preview-copy writers that INSERT
        // SELECT *; an explicitly inserted generated column would reject those writes.
        await knex
            .raw(`
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_trigger
                    WHERE tgrelid = 'cached_explore'::regclass
                      AND tgname = 'cached_explore_search_metadata_trigger'
                ) THEN
                    CREATE TRIGGER cached_explore_search_metadata_trigger
                    BEFORE INSERT OR UPDATE OF explore ON cached_explore
                    FOR EACH ROW EXECUTE FUNCTION update_cached_explore_search_metadata();
                END IF;
            END $$
        `)
            .connection(connection);

        // Keyset batches avoid rescanning already populated rows on large installs.
        // The trigger covers concurrent compiles, including older application versions.
        let lastUuid: string | undefined;
        while (true) {
            const afterUuid = lastUuid;
            const batch: Pick<BackfillRow, 'cached_explore_uuid'>[] =
                await knex<BackfillRow>('cached_explore')
                    .select<{ cached_explore_uuid: string }[]>(
                        'cached_explore_uuid',
                    )
                    .whereNull('search_metadata')
                    .modify((query) => {
                        if (afterUuid)
                            query.where('cached_explore_uuid', '>', afterUuid);
                    })
                    .orderBy('cached_explore_uuid')
                    .limit(250)
                    .connection(connection);
            if (batch.length === 0) break;
            await knex<BackfillRow>('cached_explore')
                .whereIn(
                    'cached_explore_uuid',
                    batch.map((row) => row.cached_explore_uuid),
                )
                .whereNull('search_metadata')
                .update({
                    search_metadata: knex.raw(
                        'cached_explore_search_metadata(explore)',
                    ),
                })
                .connection(connection);
            lastUuid = batch[batch.length - 1].cached_explore_uuid;
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

export async function down(knex: Knex): Promise<void> {
    const connection = await knex.client.acquireConnection();
    try {
        await knex.raw("SET lock_timeout = '5s'").connection(connection);
        await knex
            .raw(
                'DROP TRIGGER IF EXISTS cached_explore_search_metadata_trigger ON cached_explore',
            )
            .connection(connection);
        await knex
            .raw(
                'ALTER TABLE cached_explore DROP COLUMN IF EXISTS search_metadata',
            )
            .connection(connection);
        await knex
            .raw(
                'DROP FUNCTION IF EXISTS update_cached_explore_search_metadata()',
            )
            .connection(connection);
        await knex
            .raw(
                'DROP FUNCTION IF EXISTS cached_explore_search_metadata(jsonb)',
            )
            .connection(connection);
        await knex
            .raw('DROP FUNCTION IF EXISTS cached_explore_search_fields(jsonb)')
            .connection(connection);
    } finally {
        try {
            await knex.raw('RESET lock_timeout').connection(connection);
        } finally {
            await knex.client.releaseConnection(connection);
        }
    }
}
