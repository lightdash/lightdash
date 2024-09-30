import { Knex } from 'knex';

enum OrganizationMemberRole {
    MEMBER = 'member',
    VIEWER = 'viewer',
    INTERACTIVE_VIEWER = 'interactive_viewer',
    EDITOR = 'editor',
    DEVELOPER = 'developer',
    ADMIN = 'admin',
}

enum ProjectMemberRole {
    VIEWER = 'viewer',
    INTERACTIVE_VIEWER = 'interactive_viewer',
    EDITOR = 'editor',
    DEVELOPER = 'developer',
    ADMIN = 'admin',
}

enum SpaceMemberRole {
    VIEWER = 'viewer',
    EDITOR = 'editor',
    ADMIN = 'admin',
}

const ProjectMemberRoleLabels: Record<ProjectMemberRole, string> = {
    [ProjectMemberRole.VIEWER]: 'Viewer',
    [ProjectMemberRole.INTERACTIVE_VIEWER]: 'Interactive Viewer',
    [ProjectMemberRole.EDITOR]: 'Editor',
    [ProjectMemberRole.DEVELOPER]: 'Developer',
    [ProjectMemberRole.ADMIN]: 'Admin',
} as const;

type OrganizationRole = {
    type: 'organization';
    role: ProjectMemberRole | undefined;
};

type ProjectRole = {
    type: 'project';
    role: ProjectMemberRole | undefined;
};

type GroupRole = {
    type: 'group';
    role: ProjectMemberRole | undefined;
};

type InheritedRoles = [OrganizationRole, GroupRole, ProjectRole];

const RoleTypes = ['organization', 'project', 'group'] as const;

type RoleType = typeof RoleTypes[number];

type InheritedProjectRole = {
    type: RoleType;
    role: ProjectMemberRole;
};

const ProjectRoleOrder = {
    [ProjectMemberRole.VIEWER]: 0,
    [ProjectMemberRole.INTERACTIVE_VIEWER]: 1,
    [ProjectMemberRole.EDITOR]: 2,
    [ProjectMemberRole.DEVELOPER]: 3,
    [ProjectMemberRole.ADMIN]: 4,
} as const;

type DbSpaceUserAccess = {
    user_uuid: string;
    space_uuid: string;
    space_role: string;
    created_at: Date;
    updated_at: Date;
};

type CreateDbSpaceUserAccess = Pick<
    DbSpaceUserAccess,
    'user_uuid' | 'space_uuid' | 'space_role'
>;

const assertUnreachable = (_x: never, error: string | Error): never => {
    if (typeof error === 'string') {
        throw Error(error);
    } else {
        throw error;
    }
};

const convertOrganizationRoleToProjectRole = (
    organizationRole: OrganizationMemberRole,
): ProjectMemberRole | undefined => {
    switch (organizationRole) {
        case OrganizationMemberRole.VIEWER:
            return ProjectMemberRole.VIEWER;
        case OrganizationMemberRole.INTERACTIVE_VIEWER:
            return ProjectMemberRole.INTERACTIVE_VIEWER;
        case OrganizationMemberRole.EDITOR:
            return ProjectMemberRole.EDITOR;
        case OrganizationMemberRole.DEVELOPER:
            return ProjectMemberRole.DEVELOPER;
        case OrganizationMemberRole.ADMIN:
            return ProjectMemberRole.ADMIN;
        case OrganizationMemberRole.MEMBER:
            return undefined;
        default:
            return assertUnreachable(
                organizationRole,
                `Unknown role ${organizationRole}`,
            );
    }
};

const getHighestProjectRole = (
    inheritedRoles: Array<OrganizationRole | ProjectRole | GroupRole>,
): InheritedProjectRole | undefined =>
    inheritedRoles.reduce<InheritedProjectRole | undefined>(
        (highestRole, role) => {
            if (role.role === undefined) {
                return highestRole;
            }

            if (
                highestRole?.role === undefined ||
                ProjectRoleOrder[role.role] >=
                    ProjectRoleOrder[highestRole.role]
            ) {
                return {
                    type: role.type,
                    role: role.role,
                };
            }

            return highestRole;
        },
        undefined,
    );

const convertProjectRoleToSpaceRole = (
    projectRole: ProjectMemberRole,
): SpaceMemberRole => {
    switch (projectRole) {
        case ProjectMemberRole.VIEWER:
            return SpaceMemberRole.VIEWER;
        case ProjectMemberRole.INTERACTIVE_VIEWER:
            return SpaceMemberRole.VIEWER;
        case ProjectMemberRole.EDITOR:
            return SpaceMemberRole.EDITOR;
        case ProjectMemberRole.DEVELOPER:
            return SpaceMemberRole.EDITOR;
        case ProjectMemberRole.ADMIN:
            return SpaceMemberRole.ADMIN;
        default:
            return assertUnreachable(
                projectRole,
                `Project role ${projectRole} does not match Space roles`,
            );
    }
};

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

        if (spaceAccessRows.length > 0) {
            await knex(SPACE_USER_ACCESS).insert(spaceAccessRows);
        }
        await knex(SPACE_SHARE_TABLE).del();
        await knex.schema.dropTableIfExists(SPACE_SHARE_TABLE);
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable(SPACE_USER_ACCESS)) {
        if (!(await knex.schema.hasTable(SPACE_SHARE_TABLE))) {
            await knex.schema.createTable(SPACE_SHARE_TABLE, (tableBuilder) => {
                tableBuilder
                    .integer('user_id')
                    .notNullable()
                    .references('user_id')
                    .inTable(USER_TABLE)
                    .onDelete('CASCADE');
                tableBuilder
                    .integer('space_id')
                    .notNullable()
                    .references('space_id')
                    .inTable(SPACE_TABEL)
                    .onDelete('CASCADE');
                tableBuilder.unique(['user_id', 'space_id']);
            });
        }
        const rows = knex(SPACE_USER_ACCESS)
            .leftJoin(
                USER_TABLE,
                `${SPACE_USER_ACCESS}.user_uuid`,
                `${USER_TABLE}.user_uuid`,
            )
            .leftJoin(
                SPACE_TABEL,
                `${SPACE_USER_ACCESS}.space_uuid`,
                `${SPACE_TABEL}.space_uuid`,
            )
            .select<
                {
                    user_id: string;
                    space_id: string;
                }[]
            >([`${USER_TABLE}.user_id`, `${SPACE_TABEL}.space_id`]);
        await knex(SPACE_SHARE_TABLE).insert(rows);
        await knex(SPACE_USER_ACCESS).del();
    }
}
