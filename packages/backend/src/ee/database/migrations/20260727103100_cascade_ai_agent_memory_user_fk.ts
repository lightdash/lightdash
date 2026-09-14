import { Knex } from 'knex';

const AiAgentMemoryTableName = 'ai_agent_memory';
const UserForeignKeyName = 'ai_agent_memory_user_uuid_foreign';

// A memory is only ever used in its owner's turns, so it should not outlive the
// owner as an unattributed row. Kept transactional so the constraint swap is
// atomic — user_uuid is never left without referential integrity.
export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
        ALTER TABLE ${AiAgentMemoryTableName}
        DROP CONSTRAINT IF EXISTS ${UserForeignKeyName}
    `);
    await knex.raw(`
        ALTER TABLE ${AiAgentMemoryTableName}
        ADD CONSTRAINT ${UserForeignKeyName}
        FOREIGN KEY (user_uuid) REFERENCES users (user_uuid) ON DELETE CASCADE
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`
        ALTER TABLE ${AiAgentMemoryTableName}
        DROP CONSTRAINT IF EXISTS ${UserForeignKeyName}
    `);
    await knex.raw(`
        ALTER TABLE ${AiAgentMemoryTableName}
        ADD CONSTRAINT ${UserForeignKeyName}
        FOREIGN KEY (user_uuid) REFERENCES users (user_uuid) ON DELETE SET NULL
    `);
}
