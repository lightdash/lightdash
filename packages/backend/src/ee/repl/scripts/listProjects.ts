import { Knex } from 'knex';
import { OrganizationTableName } from '../../../database/entities/organizations';
import {
    DbProject,
    ProjectTableName,
} from '../../../database/entities/projects';

export function getListProjectsScripts(database: Knex) {
    async function listProjects(organizationUuid?: string) {
        const baseQuery = database(ProjectTableName)
            .select<DbProject[]>(
                `${ProjectTableName}.project_uuid`,
                `${ProjectTableName}.name`,
                `${OrganizationTableName}.organization_uuid`,
                `${ProjectTableName}.project_type`,
                `${ProjectTableName}.created_at`,
            )
            .join(
                OrganizationTableName,
                `${ProjectTableName}.organization_id`,
                `${OrganizationTableName}.organization_id`,
            );

        if (organizationUuid) {
            return baseQuery.where(
                `${OrganizationTableName}.organization_uuid`,
                organizationUuid,
            );
        }

        return baseQuery;
    }
    return {
        listProjects,
    };
}
