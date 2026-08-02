import { Knex } from 'knex';

const AvatarsTable = 'user_avatars';
const UsersTable = 'users';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(AvatarsTable))) {
        await knex.schema.createTable(AvatarsTable, (table) => {
            // PK doubles as the FK-covering index; one avatar per user.
            table
                .uuid('user_uuid')
                .primary()
                .references('user_uuid')
                .inTable(UsersTable)
                .onDelete('CASCADE');
            table.binary('image').notNullable();
            table.string('content_hash', 64).notNullable();
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
    if (!(await knex.schema.hasColumn(UsersTable, 'avatar_gradient'))) {
        await knex.schema.alterTable(UsersTable, (table) => {
            table.string('avatar_gradient', 32).nullable();
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(AvatarsTable);
    if (await knex.schema.hasColumn(UsersTable, 'avatar_gradient')) {
        await knex.schema.alterTable(UsersTable, (table) => {
            table.dropColumn('avatar_gradient');
        });
    }
}
