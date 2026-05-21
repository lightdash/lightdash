import { Knex } from 'knex';

const ORGANIZATION_SSO_CONFIGURATIONS_TABLE = 'organization_sso_configurations';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(
        ORGANIZATION_SSO_CONFIGURATIONS_TABLE,
        (table) => {
            table
                .uuid('organization_sso_configuration_uuid')
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            table
                .uuid('organization_uuid')
                .notNullable()
                .references('organization_uuid')
                .inTable('organizations')
                .onDelete('CASCADE');
            table.string('provider').notNullable();
            table.binary('config').notNullable(); // encrypted JSON
            table.boolean('enabled').notNullable().defaultTo(true);
            table
                .boolean('override_email_domains')
                .notNullable()
                .defaultTo(false);
            table
                .specificType('email_domains', 'text[]')
                .notNullable()
                .defaultTo('{}');
            table.boolean('allow_password').notNullable().defaultTo(true);
            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table
                .timestamp('updated_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table
                .uuid('created_by_user_uuid')
                .nullable()
                .references('user_uuid')
                .inTable('users')
                .onDelete('SET NULL')
                .index();
            table
                .uuid('updated_by_user_uuid')
                .nullable()
                .references('user_uuid')
                .inTable('users')
                .onDelete('SET NULL')
                .index();

            table.unique(['organization_uuid', 'provider']);
        },
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(ORGANIZATION_SSO_CONFIGURATIONS_TABLE);
}
