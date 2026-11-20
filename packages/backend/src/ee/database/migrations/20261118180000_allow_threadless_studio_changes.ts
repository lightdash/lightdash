import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Makes a column nullable and relaxes its foreign key; existing rows are unchanged.',
} as const;

const WorkspacesTableName = 'semantic_studio_workspaces';
const ThreadForeignKey = 'semantic_studio_workspaces_ai_thread_uuid_foreign';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.raw(`
        ALTER TABLE ${WorkspacesTableName}
            ALTER COLUMN ai_thread_uuid DROP NOT NULL,
            DROP CONSTRAINT ${ThreadForeignKey},
            ADD CONSTRAINT ${ThreadForeignKey} FOREIGN KEY (ai_thread_uuid)
                REFERENCES ai_thread(ai_thread_uuid) ON DELETE SET NULL
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    // Fails while threadless changes exist, rather than deleting them.
    await knex.raw(`
        ALTER TABLE ${WorkspacesTableName}
            DROP CONSTRAINT ${ThreadForeignKey},
            ADD CONSTRAINT ${ThreadForeignKey} FOREIGN KEY (ai_thread_uuid)
                REFERENCES ai_thread(ai_thread_uuid) ON DELETE CASCADE,
            ALTER COLUMN ai_thread_uuid SET NOT NULL
    `);
}
