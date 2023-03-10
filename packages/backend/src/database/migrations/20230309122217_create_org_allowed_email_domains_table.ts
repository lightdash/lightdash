import { Knex } from 'knex';

const OrganizationTableName = 'organizations';
const OrganizationAllowedEmailDomainsTableName =
    'organization_allowed_email_domains';
const organizationMembershipRolesTableName = 'organization_membership_roles';

export async function up(knex: Knex): Promise<void> {
    if (
        !(await knex.schema.hasTable(OrganizationAllowedEmailDomainsTableName))
    ) {
        await knex.schema.createTable(
            OrganizationAllowedEmailDomainsTableName,
            (tableBuilder) => {
                tableBuilder
                    .uuid('allowed_email_domains_uuid')
                    .primary()
                    .notNullable()
                    .defaultTo(knex.raw('uuid_generate_v4()'));
                tableBuilder
                    .uuid('organization_uuid')
                    .references('organization_uuid')
                    .inTable(OrganizationTableName)
                    .notNullable()
                    .unique()
                    .onDelete('CASCADE');
                tableBuilder
                    .specificType('email_domains', 'TEXT[]')
                    .notNullable();
                tableBuilder
                    .text('role')
                    .references('role')
                    .inTable(organizationMembershipRolesTableName)
                    .notNullable()
                    .onDelete('RESTRICT')
                    .defaultTo('member');
                tableBuilder
                    .specificType('project_uuids', 'TEXT[]')
                    .notNullable();
            },
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(
        OrganizationAllowedEmailDomainsTableName,
    );
}
