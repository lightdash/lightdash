import { Knex } from 'knex';

const AiAgentMemoryConsolidationRunTableName =
    'ai_agent_memory_consolidation_run';
const TriggeredByIndexName = 'ai_mem_consolidation_run_triggered_by_idx';
const TriggeredByForeignKeyName = 'ai_mem_consolidation_run_triggered_by_fk';

export const config = { transaction: false };

async function dropInvalidTriggeredByIndex(knex: Knex): Promise<void> {
    const { rows } = await knex.raw<{ rows: Array<{ exists: boolean }> }>(
        `SELECT true AS exists
         FROM pg_index
         JOIN pg_class ON pg_class.oid = pg_index.indexrelid
         WHERE pg_class.relname = ?
           AND pg_index.indrelid = ?::regclass
           AND NOT pg_index.indisvalid`,
        [TriggeredByIndexName, AiAgentMemoryConsolidationRunTableName],
    );
    if (rows.length > 0) {
        console.log('Dropping invalid consolidation trigger index');
        await knex.raw(
            `DROP INDEX CONCURRENTLY IF EXISTS ${TriggeredByIndexName}`,
        );
    }
}

async function getForeignKeyValidation(
    knex: Knex,
): Promise<boolean | undefined> {
    const { rows } = await knex.raw<{
        rows: Array<{ convalidated: boolean }>;
    }>(
        `SELECT convalidated
         FROM pg_constraint
         WHERE conname = ?
           AND conrelid = ?::regclass`,
        [TriggeredByForeignKeyName, AiAgentMemoryConsolidationRunTableName],
    );
    return rows[0]?.convalidated;
}

export async function up(knex: Knex): Promise<void> {
    await knex.raw('SET statement_timeout = 0');
    try {
        console.log('Adding consolidation trigger columns');
        await knex.raw(`
            ALTER TABLE ${AiAgentMemoryConsolidationRunTableName}
            ADD COLUMN IF NOT EXISTS trigger text NOT NULL DEFAULT 'scheduled',
            ADD COLUMN IF NOT EXISTS triggered_by_user_uuid uuid
        `);

        await dropInvalidTriggeredByIndex(knex);
        console.log('Creating consolidation trigger index');
        await knex.raw(`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS ${TriggeredByIndexName}
            ON ${AiAgentMemoryConsolidationRunTableName} (triggered_by_user_uuid)
            WHERE triggered_by_user_uuid IS NOT NULL
        `);

        const validation = await getForeignKeyValidation(knex);
        if (validation === undefined) {
            console.log('Adding consolidation trigger operator FK');
            await knex.raw(`
                ALTER TABLE ${AiAgentMemoryConsolidationRunTableName}
                ADD CONSTRAINT ${TriggeredByForeignKeyName}
                FOREIGN KEY (triggered_by_user_uuid)
                REFERENCES users(user_uuid)
                ON DELETE SET NULL
                NOT VALID
            `);
        }
        if (validation !== true) {
            console.log('Validating consolidation trigger operator FK');
            await knex.raw(`
                ALTER TABLE ${AiAgentMemoryConsolidationRunTableName}
                VALIDATE CONSTRAINT ${TriggeredByForeignKeyName}
            `);
        }
    } finally {
        await knex.raw('RESET statement_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw('SET statement_timeout = 0');
    try {
        console.log('Dropping consolidation trigger operator FK');
        await knex.raw(`
            ALTER TABLE ${AiAgentMemoryConsolidationRunTableName}
            DROP CONSTRAINT IF EXISTS ${TriggeredByForeignKeyName}
        `);
        console.log('Dropping consolidation trigger index');
        await knex.raw(`
            DROP INDEX CONCURRENTLY IF EXISTS ${TriggeredByIndexName}
        `);
        console.log('Dropping consolidation trigger columns');
        await knex.raw(`
            ALTER TABLE ${AiAgentMemoryConsolidationRunTableName}
            DROP COLUMN IF EXISTS triggered_by_user_uuid,
            DROP COLUMN IF EXISTS trigger
        `);
    } finally {
        await knex.raw('RESET statement_timeout');
    }
}
