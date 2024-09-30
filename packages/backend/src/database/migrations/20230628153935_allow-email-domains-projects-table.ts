import { Knex } from 'knex';

const OrganizationAllowedEmailDomainProjectsTableName =
    'organization_allowed_email_domain_projects';
const OrganizationAllowedEmailDomainsTableName =
    'organization_allowed_email_domains';
const projectTableName = 'projects';
const projectMembershipRolesTableName = 'project_membership_roles';

export async function up(knex: Knex): Promise<void> {
    // create new table
    await knex.schema.createTable(
        OrganizationAllowedEmailDomainProjectsTableName,
        (table) => {
            table
                .uuid('uuid')
                .primary()
                .notNullable()
                .defaultTo(knex.raw('uuid_generate_v4()'));
            table
                .uuid('allowed_email_domains_uuid')
                .references('allowed_email_domains_uuid')
                .inTable(OrganizationAllowedEmailDomainsTableName)
                .notNullable()
                .onDelete('CASCADE');
            table
                .uuid('project_uuid')
                .references('project_uuid')
                .inTable(projectTableName)
                .notNullable()
                .onDelete('CASCADE');
            table
                .text('role')
                .references('role')
                .inTable(projectMembershipRolesTableName)
                .notNullable()
                .onDelete('RESTRICT')
                .defaultTo('viewer');
            table.unique(['project_uuid', 'allowed_email_domains_uuid']);
        },
    );

    // migrate data to new table
    const allowedEmailDomains = await knex(
        OrganizationAllowedEmailDomainsTableName,
    ).select();

    const insertPromises: Promise<any>[] = [];
    allowedEmailDomains.forEach((allowedEmailDomain) => {
        // @ts-ignore
        allowedEmailDomain.project_uuids.forEach((projectUuid) => {
            insertPromises.push(
                // insert only if project exists
                knex.raw(
                    `
                        insert into "${OrganizationAllowedEmailDomainProjectsTableName}" ("allowed_email_domains_uuid", "project_uuid", "role")
                        SELECT :allowed_email_domains_uuid, :projectUuid, :role
                        where exists (SELECT *
                                      FROM projects
                                      WHERE projects.project_uuid = :projectUuid)
                    `,
                    {
                        allowed_email_domains_uuid:
                            allowedEmailDomain.allowed_email_domains_uuid,
                        role: 'viewer',
                        projectUuid,
                    },
                ),
            );
        });
    });
    await Promise.all(insertPromises);

    // delete old column
    await knex.schema.alterTable(
        OrganizationAllowedEmailDomainsTableName,
        (tableBuilder) => {
            tableBuilder.dropColumn('project_uuids');
        },
    );
}

export async function down(knex: Knex): Promise<void> {
    // add old column
    await knex.schema.alterTable(
        OrganizationAllowedEmailDomainsTableName,
        (tableBuilder) => {
            tableBuilder
                .specificType('project_uuids', 'TEXT[]')
                .notNullable()
                .defaultTo(JSON.stringify({}));
        },
    );

    // migrate data to old column
    await knex(OrganizationAllowedEmailDomainsTableName).update({
        // @ts-ignore
        project_uuids: knex(OrganizationAllowedEmailDomainProjectsTableName)
            .select(knex.raw('ARRAY_AGG(project_uuid) as project_uuids'))
            .where(
                'allowed_email_domains_uuid',
                knex.raw('??', [
                    `${OrganizationAllowedEmailDomainsTableName}.allowed_email_domains_uuid`,
                ]),
            ),
    });

    // delete new table
    await knex.schema.dropTableIfExists(
        OrganizationAllowedEmailDomainProjectsTableName,
    );
}
