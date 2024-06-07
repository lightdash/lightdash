import { Knex } from 'knex';

const SlackAuthTokensTableName = 'slack_auth_tokens';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SlackAuthTokensTableName, (table) => {
        table.string('app_profile_photo_url').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    if (
        await knex.schema.hasColumn(
            SlackAuthTokensTableName,
            'app_profile_photo_url',
        )
    ) {
        await knex.schema.alterTable(SlackAuthTokensTableName, (table) => {
            table.dropColumn('app_profile_photo_url');
        });
    }
}
