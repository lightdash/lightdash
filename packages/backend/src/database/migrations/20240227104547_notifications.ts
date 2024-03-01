import { Knex } from 'knex';

const notificationsTable = 'notifications';
const usersTable = 'users';

export async function up(knex: Knex): Promise<void> {
    return knex.schema.createTable(notificationsTable, (table) => {
        table
            .uuid('notification_id')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.uuid('user_uuid').notNullable().index();
        table
            .foreign('user_uuid')
            .references('user_uuid')
            .inTable(usersTable)
            .onDelete('CASCADE');
        table.string('resource_type').notNullable().index();
        table.string('resource_uuid').nullable().index();
        table.boolean('viewed').notNullable().defaultTo(false);
        table.jsonb('metadata').nullable();
        table.string('message').nullable();
        table.string('url').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    return knex.schema.dropTable(notificationsTable);
}
