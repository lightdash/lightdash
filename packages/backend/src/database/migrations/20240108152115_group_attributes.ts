import { Knex } from 'knex';

const userAttributesTableName = 'user_attributes';
const groupUserAttributes = 'group_user_attributes';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(groupUserAttributes))) {
        await knex.schema.createTable(groupUserAttributes, (table) => {
            table.uuid('group_uuid').notNullable();
            table.integer('organization_id').notNullable();

            table
                .foreign(['group_uuid', 'organization_id'])
                .references(['group_uuid', 'organization_id'])
                .inTable('groups')
                .onDelete('CASCADE');
            table.uuid('user_attribute_uuid').notNullable();
            table
                .foreign(['user_attribute_uuid', 'organization_id'])
                .references(['user_attribute_uuid', 'organization_id'])
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
