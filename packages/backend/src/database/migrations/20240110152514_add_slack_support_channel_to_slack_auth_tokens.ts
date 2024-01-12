import { Knex } from 'knex';

const SlackAuthTokensTableName = 'slack_auth_tokens';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SlackAuthTokensTableName, (table) => {
        table.string('notification_channel').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    if (
        await knex.schema.hasColumn(
            SlackAuthTokensTableName,
            'notification_channel',
        )
    ) {
        await knex.schema.alterTable(SlackAuthTokensTableName, (table) => {
            table.dropColumn('notification_channel');
        });
    }
}
