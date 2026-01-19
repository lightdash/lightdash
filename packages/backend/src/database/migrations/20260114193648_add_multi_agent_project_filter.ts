import { Knex } from 'knex';

const SlackAuthTokensTableName = 'slack_auth_tokens';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SlackAuthTokensTableName, (table) => {
        table.specificType('ai_multi_agent_project_uuids', 'text[]').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SlackAuthTokensTableName, (table) => {
        table.dropColumn('ai_multi_agent_project_uuids');
    });
}
