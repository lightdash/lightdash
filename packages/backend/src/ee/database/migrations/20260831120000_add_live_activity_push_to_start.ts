import type { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds nullable push-to-start fields and an empty attempt table',
} as const;

const installationsTable = 'mobile_push_installations';
const startAttemptsTable = 'ai_agent_live_activity_start_attempts';
const installationsPushToStartTokenUnique =
    'mobile_push_installations_push_start_token_uq';
const startAttemptsInstallationForeign =
    'live_activity_start_attempts_installation_fk';
const startAttemptsInstallationIndex =
    'live_activity_start_attempts_installation_idx';
const startAttemptsInstallationPromptUnique =
    'live_activity_start_attempts_installation_prompt_uq';
const startAttemptsStatusAttemptedIndex =
    'live_activity_start_attempts_status_attempted_idx';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);

    await knex.schema.alterTable(installationsTable, (table) => {
        table.binary('encrypted_push_to_start_token').nullable();
        table.string('push_to_start_token_fingerprint', 64).nullable();
        table.unique(['environment', 'push_to_start_token_fingerprint'], {
            indexName: installationsPushToStartTokenUnique,
        });
    });

    await knex.schema.createTable(startAttemptsTable, (table) => {
        table
            .uuid('live_activity_start_attempt_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('live_activity_uuid')
            .notNullable()
            .unique()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .uuid('mobile_push_installation_uuid')
            .notNullable()
            .references('mobile_push_installation_uuid')
            .inTable(installationsTable)
            .onDelete('CASCADE')
            .withKeyName(startAttemptsInstallationForeign)
            .index(startAttemptsInstallationIndex);
        table
            .uuid('prompt_uuid')
            .notNullable()
            .references('ai_prompt_uuid')
            .inTable('ai_prompt')
            .onDelete('CASCADE')
            .index();
        table
            .text('status')
            .notNullable()
            .checkIn([
                'excluded',
                'pending',
                'processing',
                'retryable',
                'sent',
                'failed',
            ]);
        table.integer('attempt_count').notNullable().defaultTo(0);
        table.timestamp('last_attempted_at', { useTz: false }).nullable();
        table.string('last_token_fingerprint', 64).nullable();
        table.timestamp('completed_at', { useTz: false }).nullable();
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());

        table.unique(['mobile_push_installation_uuid', 'prompt_uuid'], {
            indexName: startAttemptsInstallationPromptUnique,
        });
        table.index(
            ['status', 'last_attempted_at'],
            startAttemptsStatusAttemptedIndex,
        );
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);
    await knex.schema.dropTableIfExists(startAttemptsTable);
    await knex.schema.alterTable(installationsTable, (table) => {
        table.dropColumn('push_to_start_token_fingerprint');
        table.dropColumn('encrypted_push_to_start_token');
    });
}
