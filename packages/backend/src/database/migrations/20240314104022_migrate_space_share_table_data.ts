import {
    convertOrganizationRoleToProjectRole,
    convertProjectRoleToSpaceRole,
    getHighestProjectRole,
} from '@lightdash/common';
import { OrganizationMemberRole } from '@lightdash/common/src/types/organizationMemberProfile';
import {
    GroupRole,
    OrganizationRole,
    ProjectMemberRole,
    ProjectRole,
} from '@lightdash/common/src/types/projectMemberRole';
import { Knex } from 'knex';
import { CreateDbSpaceUserAccess, DbSpaceUserAccess } from '../entities/spaces';

const SPACE_USER_ACCESS = 'space_user_access';
const SPACE_SHARE_TABLE = 'space_share';
const USER_TABLE = 'users';
const SPACE_TABEL = 'spaces';
const ORGANIZATION_MEMBERSHIPS_TABLE = 'organization_memberships';
const PROJECT_MEMBERSHIPS_TABLE = 'project_memberships';
const GROUP_MEMBERSHIPS_TABLE = 'group_memberships';
const PROJECTS_TABLE = 'projects';
const ORGANIZATION_TABLE = 'organizations';
const PROJECT_GROUP_ACCESS_TABLE = 'project_group_access';

export async function up(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable(SPACE_SHARE_TABLE)) {
        const rows = knex(SPACE_SHARE_TABLE)
            .leftJoin(
                USER_TABLE,
                `${SPACE_SHARE_TABLE}.user_id`,
                `${USER_TABLE}.user_id`,
            )
            .leftJoin(
                SPACE_TABEL,
                `${SPACE_SHARE_TABLE}.space_id`,
                `${SPACE_TABEL}.space_id`,
            )
            .leftJoin(
                PROJECTS_TABLE,
                `${SPACE_TABEL}.project_id`,
                `${PROJECTS_TABLE}.project_id`,
            )
            .leftJoin(
                ORGANIZATION_TABLE,
                `${PROJECTS_TABLE}.organization_id`,
                `${ORGANIZATION_TABLE}.organization_id`,
            )
            .leftJoin(
                ORGANIZATION_MEMBERSHIPS_TABLE,
                function joinProjectMembershipTable() {
                    this.on(
                        `${USER_TABLE}.user_id`,
                        '=',
                        `${ORGANIZATION_MEMBERSHIPS_TABLE}.user_id`,
                    ).andOn(
                        `${ORGANIZATION_TABLE}.organization_id`,
                        '=',
                        `${ORGANIZATION_MEMBERSHIPS_TABLE}.organization_id`,
                    );
                },
            )
            .leftJoin(
                PROJECT_MEMBERSHIPS_TABLE,
                function joinProjectMembershipTable() {
                    this.on(
                        `${USER_TABLE}.user_id`,
                        '=',
                        `${PROJECT_MEMBERSHIPS_TABLE}.user_id`,
                    ).andOn(
                        `${PROJECTS_TABLE}.project_id`,
                        '=',
                        `${PROJECT_MEMBERSHIPS_TABLE}.project_id`,
                    );
                },
            )
            .leftJoin(
                GROUP_MEMBERSHIPS_TABLE,
                `${ORGANIZATION_MEMBERSHIPS_TABLE}.user_id`,
                `${GROUP_MEMBERSHIPS_TABLE}.user_id`,
            )
            .leftJoin(
                PROJECT_GROUP_ACCESS_TABLE,
                function joinProjectGroupAccessTable() {
                    this.on(
                        `${GROUP_MEMBERSHIPS_TABLE}.group_uuid`,
                        '=',
                        `${PROJECT_GROUP_ACCESS_TABLE}.group_uuid`,
                    ).andOn(
                        `${PROJECTS_TABLE}.project_uuid`,
                        '=',
                        `${PROJECT_GROUP_ACCESS_TABLE}.project_uuid`,
                    );
                },
            )
            .groupBy(
                `${USER_TABLE}.user_uuid`,
                `${SPACE_TABEL}.space_uuid`,
                `${PROJECT_MEMBERSHIPS_TABLE}.role`,
                `${ORGANIZATION_MEMBERSHIPS_TABLE}.role`,
            )
            .select<
                {
                    user_uuid: string;
                    space_uuid: string;
                    project_role: ProjectMemberRole | null;
                    organization_role: OrganizationMemberRole;
                    group_roles: (ProjectMemberRole | null)[];
                }[]
            >([
                `${USER_TABLE}.user_uuid`,
                `${SPACE_TABEL}.space_uuid`,
                `${PROJECT_MEMBERSHIPS_TABLE}.role as project_role`,
                `${ORGANIZATION_MEMBERSHIPS_TABLE}.role as organization_role`,
                knex.raw(
                    `array_agg(${PROJECT_GROUP_ACCESS_TABLE}.role) as group_roles`,
                ),
            ]);

        const spaceAccessRows = (await rows).reduce<CreateDbSpaceUserAccess[]>(
            (
                acc,
                {
                    user_uuid,
                    space_uuid,
                    project_role,
                    organization_role,
                    group_roles,
                },
            ) => {
                const inheritedOrgRole: OrganizationRole = {
                    type: 'organization',
                    role: convertOrganizationRoleToProjectRole(
                        organization_role,
                    ),
                };

                const inheritedProjectRole: ProjectRole = {
                    type: 'project',
                    role: project_role ?? undefined,
                };

                const inheritedGroupRoles: GroupRole[] = group_roles.map(
                    (role) => ({ type: 'group', role: role ?? undefined }),
                );

                const highestRole = getHighestProjectRole([
                    inheritedOrgRole,
                    inheritedProjectRole,
                    ...inheritedGroupRoles,
                ]);

                if (!highestRole) {
                    return acc;
                }

                return [
                    ...acc,
                    {
                        user_uuid,
                        space_uuid,
                        space_role: convertProjectRoleToSpaceRole(
                            highestRole.role,
                        ),
                    },
                ];
            },
            [],
        );

        await knex(SPACE_USER_ACCESS).insert(spaceAccessRows);
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex(SPACE_USER_ACCESS).del();
}
