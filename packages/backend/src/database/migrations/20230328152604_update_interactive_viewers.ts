import { Knex } from 'knex';

const organizationMembershipsTableName = 'organization_memberships';
const projectMembershipsTableName = 'organization_memberships';

const interactiveViewerRole = 'interactive_viewer';
const viewerRole = 'viewer';
export async function up(knex: Knex): Promise<void> {
    await knex(projectMembershipsTableName)
        .update('role', interactiveViewerRole)
        .where('role', viewerRole);

    await knex(organizationMembershipsTableName)
        .update('role', interactiveViewerRole)
        .where('role', viewerRole);
}

export async function down(knex: Knex): Promise<void> {
    await knex(projectMembershipsTableName)
        .update('role', viewerRole)
        .where('role', interactiveViewerRole);

    await knex(organizationMembershipsTableName)
        .update('role', viewerRole)
        .where('role', interactiveViewerRole);
}
