import { Knex } from 'knex';

const userAttributesTableName = 'user_attributes';
const organizationMemberUserAttributes = 'organization_member_user_attributes';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(userAttributesTableName))) {
        await knex.schema.createTable(userAttributesTableName, (table) => {
            table
                .uuid('user_attribute_uuid')
                .primary()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            table.string('name').notNullable();
            table.string('description').nullable();

            table
                .timestamp('created_at', { useTz: false })
                .notNullable()
                .defaultTo(knex.fn.now());
            table
                .uuid('organization_uuid')
                .notNullable()
                .references('organization_uuid')
                .inTable('organizations')
                .onDelete('CASCADE');
            table.unique(['name', 'organization_uuid']);
        });
    }
    if (!(await knex.schema.hasTable(organizationMemberUserAttributes))) {
        await knex.schema.createTable(
            organizationMemberUserAttributes,
            (table) => {
                table.integer('user_id').notNullable();
                table.integer('organization_id').notNullable();
                table
                    .foreign(['user_id', 'organization_id'])
                    .references(['user_id', 'organization_id'])
                    .inTable('organization_memberships')
                    .onDelete('CASCADE');
                table
                    .uuid('user_attribute_uuid')
                    .notNullable()
                    .references('user_attribute_uuid')
                    .inTable(userAttributesTableName)
                    .onDelete('CASCADE');
                table.string('value').notNullable();
                table.primary([
                    'user_id',
                    'organization_id',
                    'user_attribute_uuid',
                ]);
            },
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(userAttributesTableName);

    await knex.schema.dropTableIfExists(organizationMemberUserAttributes);
}
