import type { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds a nullable ai_web_app_thread.embed_space_uuids column and backfills it from embed_space_uuid in bounded, state-guarded batches; older pods keep reading and writing embed_space_uuid.',
} as const;

export const config = { transaction: false };

const tableName = 'ai_web_app_thread';
const BACKFILL_BATCH_SIZE = 10000;

export const backfillEmbedSpaceUuids = async (knex: Knex): Promise<number> => {
    let updated = 0;
    for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const batch = await knex.raw(
            `UPDATE ${tableName}
             SET embed_space_uuids = ARRAY[embed_space_uuid]
             WHERE ctid IN (
                 SELECT ctid FROM ${tableName}
                 WHERE embed_space_uuid IS NOT NULL AND embed_space_uuids IS NULL
                 LIMIT ${BACKFILL_BATCH_SIZE}
             )`,
        );
        if (batch.rowCount === 0) break;
        updated += batch.rowCount;
    }
    return updated;
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw('SET statement_timeout = 0');
    try {
        await knex.raw(`SET lock_timeout = '5s'`);
        await knex.raw(
            `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS embed_space_uuids UUID[] NULL`,
        );
        await knex.raw('RESET lock_timeout');

        console.log(`${tableName}: backfilling embed_space_uuids`);
        const updated = await backfillEmbedSpaceUuids(knex);
        console.log(`${tableName}: backfilled ${updated} threads`);
    } finally {
        await knex.raw('RESET statement_timeout');
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '5s'`);
    try {
        await knex.raw(
            `ALTER TABLE ${tableName} DROP COLUMN IF EXISTS embed_space_uuids`,
        );
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
