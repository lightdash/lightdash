import { Knex } from 'knex';

const SlackAuthTokensTableName = 'slack_auth_tokens';

// Profile photo URLs (e.g. signed CDN/object-storage URLs) can exceed the
// varchar(255) Knex default, which caused saves to fail. 2048 is the de-facto
// safe URL length. Widening is a metadata-only change in Postgres (no rewrite).
export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SlackAuthTokensTableName, (table) => {
        table.string('app_profile_photo_url', 2048).nullable().alter();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SlackAuthTokensTableName, (table) => {
        table.string('app_profile_photo_url', 255).nullable().alter();
    });
}
