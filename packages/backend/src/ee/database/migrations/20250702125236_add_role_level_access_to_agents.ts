import { Knex } from 'knex';

const AiAgentTableName = 'ai_agent';
const ProjectMembershipRolesTableName = 'project_membership_roles';

export async function up(knex: Knex): Promise<void> {
    if (await knex.schema.hasColumn(AiAgentTableName, 'minimum_access_role'))
        return;

    await knex.schema.alterTable(AiAgentTableName, (table) => {
        table
            .text('minimum_access_role')
            .nullable()
            .references('role')
            .inTable(ProjectMembershipRolesTableName)
            .onDelete('RESTRICT')
            .defaultTo(null);
    });
}

export async function down(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasColumn(AiAgentTableName, 'minimum_access_role')))
        return;

    await knex.schema.alterTable(AiAgentTableName, (table) => {
        table.dropForeign(['minimum_access_role']);
        table.dropColumn('minimum_access_role');
    });
}
