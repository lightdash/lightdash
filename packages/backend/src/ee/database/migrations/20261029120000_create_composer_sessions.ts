import { Knex } from 'knex';

const TableName = 'composer_sessions';

export const classification = {
    kind: 'safe',
    reason: 'Creates a new empty composer_sessions table; existing tables and readers are unaffected.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.schema.createTable(TableName, (table) => {
            table
                .uuid('composer_session_uuid')
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));
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
            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table
                .timestamp('last_used_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now())
                .index();
        });
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.schema.dropTableIfExists(TableName);
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
