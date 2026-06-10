import { Knex } from 'knex';

const ORGANIZATION_SETTINGS_TABLE = 'organization_settings';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(ORGANIZATION_SETTINGS_TABLE, (table) => {
        // 1:1 with organizations — the FK column is the primary key, which
        // also serves as the index Postgres needs for the ON DELETE CASCADE.
        table
            .uuid('organization_uuid')
            .primary()
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE');
        // Per-org auth account-linking toggles (migrated from instance-wide
        // AUTH_ENABLE_OIDC_LINKING / AUTH_ENABLE_OIDC_TO_EMAIL_LINKING env
        // vars). Nullable: NULL means "not set — inherit the instance/env
        // default"; an explicit true/false overrides the env. Rows are sparse —
        // only columns an admin has set are written, the rest stay NULL.
        table.boolean('oidc_linking_enabled').nullable();
        table.boolean('oidc_to_email_linking_enabled').nullable();
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .timestamp('updated_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(ORGANIZATION_SETTINGS_TABLE);
}
