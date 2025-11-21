import { Knex } from 'knex';

const SlackAuthTokensTableName = 'slack_auth_tokens';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SlackAuthTokensTableName, (table) => {
        table
            .text('ai_multi_agent_channel_id')
            .nullable()
            .comment(
                'Slack channel ID where users can interact with any AI agent via dropdown selection',
            );
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SlackAuthTokensTableName, (table) => {
        table.dropColumn('ai_multi_agent_channel_id');
    });
}
