import { subject } from '@casl/ability';
import {
    getHighestProjectRole,
    OrganizationMemberProfile,
    OrganizationMemberRole,
    ProjectMemberProfile,
    ProjectMemberRole,
} from '@lightdash/common';
import { Paper, Table } from '@mantine/core';
import { FC, useMemo } from 'react';
import { useProjectGroupAccessList } from '../../features/projectGroupAccess/hooks/useProjectGroupAccess';
import { useTableStyles } from '../../hooks/styles/useTableStyles';
import { useOrganizationGroups } from '../../hooks/useOrganizationGroups';
import { useOrganizationUsers } from '../../hooks/useOrganizationUsers';
import {
    useProjectAccess,
    useRevokeProjectAccessMutation,
    useUpdateProjectAccessMutation,
} from '../../hooks/useProjectAccess';
import { useApp } from '../../providers/AppProvider';
import { useAbilityContext } from '../common/Authorization';
import LoadingState from '../common/LoadingState';
import ProjectAccessCreation from './ProjectAccessCreation';
import ProjectAccessRow from './ProjectAccessRow';

const relevantOrgRolesForProjectRole: Record<
    ProjectMemberRole,
    OrganizationMemberRole[]
> = {
    [ProjectMemberRole.VIEWER]: [
        OrganizationMemberRole.INTERACTIVE_VIEWER,
        OrganizationMemberRole.EDITOR,
        OrganizationMemberRole.DEVELOPER,
        OrganizationMemberRole.ADMIN,
    ],
    [ProjectMemberRole.INTERACTIVE_VIEWER]: [
        OrganizationMemberRole.EDITOR,
        OrganizationMemberRole.DEVELOPER,
        OrganizationMemberRole.ADMIN,
    ],
    [ProjectMemberRole.EDITOR]: [
        OrganizationMemberRole.DEVELOPER,
        OrganizationMemberRole.ADMIN,
    ],
    [ProjectMemberRole.DEVELOPER]: [OrganizationMemberRole.ADMIN],
    [ProjectMemberRole.ADMIN]: [],
};

interface ProjectAccessProps {
    projectUuid: string;
    isAddingProjectAccess: boolean;
    onAddProjectAccessClose: () => void;
}

const ProjectAccess: FC<ProjectAccessProps> = ({
    projectUuid,
    isAddingProjectAccess,
    onAddProjectAccessClose,
}) => {
    const { user } = useApp();

    const { cx, classes } = useTableStyles();

    const ability = useAbilityContext();
    const { mutate: revokeAccess } =
        useRevokeProjectAccessMutation(projectUuid);
    const { mutate: updateAccess } =
        useUpdateProjectAccessMutation(projectUuid);

    const {
        data: organizationUsers,
        isInitialLoading: isOrganizationUsersLoading,
    } = useOrganizationUsers();
    const { data: groups } = useOrganizationGroups(5);
    const { data: projectAccess, isInitialLoading: isProjectAccessLoading } =
        useProjectAccess(projectUuid);
    const { data: projectGroupAccess } = useProjectGroupAccessList(projectUuid);

    const [inheritedPermissions, overlapPermissions] = useMemo(() => {
        if (projectAccess === undefined) return [[], []];

        const projectMemberEmails = projectAccess.map(
            (projectMember) => projectMember.email,
        );

        if (organizationUsers === undefined) return [[], []];

        return organizationUsers.reduce<
            [OrganizationMemberProfile[], OrganizationMemberProfile[]]
        >(
            ([inherited, overlapping], orgUser) => {
                if (orgUser.role === OrganizationMemberRole.MEMBER) {
                    return [inherited, overlapping];
                }
                if (projectMemberEmails.includes(orgUser.email)) {
                    return [inherited, [...overlapping, orgUser]];
                }
                return [[...inherited, orgUser], overlapping];
            },
            [[], []],
        );
    }, [organizationUsers, projectAccess]);

    console.log('inheritedPermissions', inheritedPermissions);
    console.log('overlapPermissions', overlapPermissions);

    const groupRoles = useMemo(() => {
        if (!organizationUsers) return {};
        if (!projectGroupAccess) return {};
        if (!groups) return {};

        return organizationUsers.reduce<Record<string, ProjectMemberRole>>(
            (acc, orgUser) => {
                const userGroupRoles = projectGroupAccess.reduce<
                    ProjectMemberRole[]
                >((userRoles, groupAccess) => {
                    const group = groups.find(
                        (g) => g.uuid === groupAccess.groupUuid,
                    );
                    if (!group) return userRoles;
                    if (!group.memberUuids.includes(orgUser.userUuid))
                        return userRoles;

                    return [...userRoles, groupAccess.role];
                }, []);

                const highestRole = getHighestProjectRole(userGroupRoles);

                if (highestRole === undefined) return acc;

                return {
                    ...acc,
                    [orgUser.userUuid]: highestRole,
                };
            },
            {},
        );
    }, [organizationUsers, projectGroupAccess, groups]);

    console.log('groupRoles', groupRoles);

    const canManageProjectAccess = ability.can(
        'manage',
        subject('Project', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    const handleUpdate = (
        projectMember: ProjectMemberProfile,
        newRole: ProjectMemberRole,
    ) => {
        if (!canManageProjectAccess) return;

        updateAccess({
            userUuid: projectMember.userUuid,
            role: newRole,
        });
    };

    const handleDelete = (projectMember: ProjectMemberProfile) => {
        if (!canManageProjectAccess) return;
        revokeAccess(projectMember.userUuid);
    };

    if (isProjectAccessLoading || isOrganizationUsersLoading) {
        return <LoadingState title="Loading user access" />;
    }


    relevantOrgRole={
        overlapPermissions.find(
            ({ email, role }) =>
                email === projectMember.email &&
                relevantOrgRolesForProjectRole[
                    projectMember.role
                ].includes(role),
        )?.role
    }


    return (
        <>
            <Paper withBorder sx={{ overflow: 'hidden' }}>
                <Table className={cx(classes.root, classes.alignLastTdRight)}>
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Role</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {projectAccess?.map((projectMember) => (
                            <ProjectAccessRow
                                key={projectMember.email}
                                user={projectMember}
                                overalappingRole={{
                                    type: 'organization',
                                    role: projectMember.role,
                                }}
                                onUpdate={(newRole) =>
                                    handleUpdate(projectMember, newRole)
                                }
                                onDelete={() => handleDelete(projectMember)}
                            />
                        ))}

                        {inheritedPermissions?.map((orgUser) => (
                            <ProjectAccessRow
                                key={orgUser.email}
                                user={orgUser}
                                roleTooltip={`This user inherits the organization role: ${orgUser.role}`}
                            />
                        ))}
                    </tbody>
                </Table>
            </Paper>

            {isAddingProjectAccess && (
                <ProjectAccessCreation
                    opened
                    projectUuid={projectUuid}
                    onClose={() => onAddProjectAccessClose()}
                />
            )}
        </>
    );
};

export default ProjectAccess;
