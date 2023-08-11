import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable('groups'))) {
        await knex.schema.createTable('groups', (table) => {
            table
                .uuid('group_uuid')
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            table.string('name').notNullable();
            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table
                .integer('organization_id')
                .notNullable()
                .references('organization_id')
                .inTable('organizations')
                .onDelete('CASCADE');
            table.unique(['group_uuid', 'organization_id']);
        });
    }
    if (!(await knex.schema.hasTable('group_memberships'))) {
        await knex.schema.createTable('group_memberships', (table) => {
            table.uuid('group_uuid').notNullable();
            table.integer('user_id').notNullable();
            table.integer('organization_id').notNullable();
            table
                .foreign(['user_id', 'organization_id'])
                .references(['user_id', 'organization_id'])
                .inTable('organization_memberships')
                .onDelete('CASCADE');
            table
                .foreign(['group_uuid', 'organization_id'])
                .references(['group_uuid', 'organization_id'])
                .inTable('groups')
                .onDelete('CASCADE');
            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table.primary(['group_uuid', 'user_id']);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists('group_memberships');
    await knex.schema.dropTableIfExists('groups');
}
