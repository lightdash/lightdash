import { Knex } from 'knex';

const userAttributesTableName = 'user_attributes';
const groupUserAttributes = 'group_user_attributes';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(groupUserAttributes))) {
        await knex.schema.createTable(groupUserAttributes, (table) => {
            table
                .uuid('group_uuid')
                .notNullable()
                .references('group_uuid')
                .inTable('groups')
                .onDelete('CASCADE');
            table
                .uuid('user_attribute_uuid')
                .notNullable()
                .references('user_attribute_uuid')
                .inTable(userAttributesTableName)
                .onDelete('CASCADE');
            table.string('value').notNullable();
            table.primary(['group_uuid', 'user_attribute_uuid']);
        });
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(groupUserAttributes);
}
