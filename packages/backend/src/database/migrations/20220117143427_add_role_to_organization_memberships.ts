import { Knex } from 'knex';

const organizationMembershipRolesTableName = 'organization_membership_roles';
const organizationMembershipsTableName = 'organization_memberships';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(organizationMembershipRolesTableName))) {
        await knex.schema.createTable(
            organizationMembershipRolesTableName,
            (tableBuilder) => {
                tableBuilder.text('role').primary();
            },
        );
        await knex(organizationMembershipRolesTableName).insert(
            ['viewer', 'editor', 'admin'].map((role) => ({ role })),
        );
    }
    await knex.schema.table(
        organizationMembershipsTableName,
        (tableBuilder) => {
            tableBuilder
                .text('role')
                .references('role')
                .inTable(organizationMembershipRolesTableName)
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
    await knex.schema.dropTableIfExists(organizationMembershipRolesTableName);
}
