import { type Knex } from 'knex';

export const up = async (knex: Knex): Promise<void> => {
    await knex.schema.createTable('organization_allowed_domains', (table) => {
        table
            .uuid('organization_allowed_domain_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .integer('organization_id')
            .notNullable()
            .references('organization_id')
            .inTable('organizations')
            .onDelete('CASCADE');
        table.text('domain').notNullable();
        table.text('type').notNullable().defaultTo('embed');
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table
            .uuid('created_by_user_uuid')
            .references('user_uuid')
            .inTable('users')
            .onDelete('SET NULL');
        table.unique(['organization_id', 'domain']);
    });
};

export const down = async (knex: Knex): Promise<void> => {
    await knex.schema.dropTableIfExists('organization_allowed_domains');
};
