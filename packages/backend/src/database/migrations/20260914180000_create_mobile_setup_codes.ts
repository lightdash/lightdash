import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.createTable('mobile_setup_codes', (table) => {
        table
            .uuid('mobile_setup_code_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table.string('code_hash', 64).notNullable().unique();
        table
            .uuid('user_uuid')
            .notNullable()
            .references('user_uuid')
            .inTable('users')
            .onDelete('CASCADE')
            .index();
        table
            .uuid('organization_uuid')
            .notNullable()
            .references('organization_uuid')
            .inTable('organizations')
            .onDelete('CASCADE')
            .index();
        table
            .uuid('project_uuid')
            .notNullable()
            .references('project_uuid')
            .inTable('projects')
            .onDelete('CASCADE')
            .index();
        table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        table.timestamp('expires_at').notNullable();
        table.timestamp('redeemed_at').nullable();
        table.string('redeemed_client_id').nullable();
        table.string('redeemed_platform').nullable();
        table.timestamp('revoked_at').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.dropTableIfExists('mobile_setup_codes');
}
