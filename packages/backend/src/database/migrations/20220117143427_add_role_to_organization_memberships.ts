import { Knex } from 'knex';

const organizationmembershipRolesTableName = 'organization_membership_roles';
const organizationMembershipsTableName = 'organization_memberships';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(organizationmembershipRolesTableName))) {
        await knex.schema.createTable(
            organizationmembershipRolesTableName,
            (tableBuilder) => {
                tableBuilder.text('role').primary();
            },
        );
        await knex(organizationmembershipRolesTableName).insert(
            ['viewer', 'editor', 'admin'].map((role) => ({ role })),
        );
    }
    await knex.schema.table(
        organizationMembershipsTableName,
        (tableBuilder) => {
            tableBuilder
                .text('role')
                .references('role')
                .inTable(organizationmembershipRolesTableName)
                .notNullable()
                .onDelete('RESTRICT')
                .defaultTo('admin');
        },
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.table(
        organizationMembershipsTableName,
        (tableBuilder) => {
            tableBuilder.dropColumn('role');
        },
    );
    await knex.schema.dropTableIfExists(organizationmembershipRolesTableName);
}
