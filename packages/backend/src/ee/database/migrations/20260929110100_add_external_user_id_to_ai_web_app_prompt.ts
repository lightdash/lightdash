import { Knex } from 'knex';

const AiWebAppPromptTableName = 'ai_web_app_prompt';

export const classification = {
    kind: 'safe',
    reason: 'Adds one nullable text column with no default to the web app prompt table. Raw SQL only sets a lock timeout; existing rows and readers are unaffected.',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(AiWebAppPromptTableName, (table) => {
        table
            .text('external_user_id')
            .nullable()
            .comment(
                'Viewer id from the embed token of the request that sent this prompt. Embedded viewers share one user, so this is what tells them apart.',
            );
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable(AiWebAppPromptTableName, (table) => {
        table.dropColumn('external_user_id');
    });
}
