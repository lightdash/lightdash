import { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds an organization settings table without changing existing data.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.createTable(
        'organization_agent_identity_settings',
        (table) => {
            table
                .uuid('organization_uuid')
                .primary()
                .references('organization_uuid')
                .inTable('organizations')
                .onDelete('CASCADE');
            table
                .boolean('require_verified_agent_sessions')
                .notNullable()
                .defaultTo(false);
            table.timestamps(true, true);
        },
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.dropTable('organization_agent_identity_settings');
}
