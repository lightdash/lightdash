import { DefaultSupportedDbtVersion, ProjectType } from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';

export type Fixture = {
    projectUuid: string;
    spaceUuid: string;
    userUuid: string;
};

export const createFixture = async (database: Knex): Promise<Fixture> => {
    const [{ organization_id: organizationId }] = await database(
        'organizations',
    )
        .insert({ organization_name: `composer tiles ${randomUUID()}` })
        .returning('organization_id');
    const [{ user_uuid: userUuid }] = await database('users')
        .insert({
            first_name: 'Composer',
            last_name: 'Tiles',
            is_active: true,
            is_marketing_opted_in: false,
            is_setup_complete: true,
            is_tracking_anonymized: false,
        })
        .returning('user_uuid');
    const [{ project_id: projectId, project_uuid: projectUuid }] =
        await database('projects')
            .insert({
                name: 'composer tiles',
                organization_id: organizationId,
                project_type: ProjectType.DEFAULT,
                dbt_connection: null,
                dbt_connection_type: null,
                copied_from_project_uuid: null,
                dbt_version: DefaultSupportedDbtVersion,
                created_by_user_uuid: userUuid,
                organization_warehouse_credentials_uuid: null,
            })
            .returning(['project_id', 'project_uuid']);
    const [{ space_uuid: spaceUuid }] = await database('spaces')
        .insert({
            name: 'Reports',
            slug: 'reports',
            path: 'reports',
            project_id: projectId,
            parent_space_uuid: null,
            inherit_parent_permissions: true,
            is_default_user_space: false,
        })
        .returning('space_uuid');
    return { projectUuid, spaceUuid, userUuid };
};
