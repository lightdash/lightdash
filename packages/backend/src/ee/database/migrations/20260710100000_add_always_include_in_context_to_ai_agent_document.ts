import { Knex } from 'knex';

const AiAgentDocumentTableName = 'ai_agent_document';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiAgentDocumentTableName, (table) => {
        table
            .boolean('always_include_in_context')
            .notNullable()
            .defaultTo(false)
            .comment(
                'Whether the full document is included in every agent prompt instead of retrieved on demand.',
            );
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AiAgentDocumentTableName, (table) => {
        table.dropColumn('always_include_in_context');
    });
}
