import { subject } from '@casl/ability';
import {
    convertOrganizationRoleToProjectRole,
    getHighestProjectRole,
    OrganizationMemberProfile,
    OrganizationMemberRole,
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
    const { mutate: updateAccess, isLoading: isUpdatingAccess } =
        useUpdateProjectAccessMutation(projectUuid);

    const {
        data: organizationUsers,
        isInitialLoading: isOrganizationUsersLoading,
    } = useOrganizationUsers();
    const { data: groups } = useOrganizationGroups(5);
    const { data: projectAccess, isInitialLoading: isProjectAccessLoading } =
        useProjectAccess(projectUuid);
    const { data: projectGroupAccess } = useProjectGroupAccessList(projectUuid);

    const orgRoles = useMemo(() => {
        if (!organizationUsers) return {};
        if (!projectAccess) return {};

        return organizationUsers.reduce<Record<string, OrganizationMemberRole>>(
            (acc, orgUser) => {
                return {
                    ...acc,
                    [orgUser.userUuid]: orgUser.role,
                };
            },
            {},
        );
    }, [organizationUsers, projectAccess]);

    const groupRoles = useMemo(() => {
        if (!organizationUsers) return {};
        if (!projectGroupAccess) return {};
        if (!groups) return {};

        return organizationUsers.reduce<Record<string, ProjectMemberRole>>(
            (aggregatedRoles, orgUser) => {
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

                const highestRole = getHighestProjectRole(
                    userGroupRoles.map((role) => ({
                        type: 'group',
                        role,
                    })),
                );

                if (!highestRole) return aggregatedRoles;

                return {
                    ...aggregatedRoles,
                    [orgUser.userUuid]: highestRole.role,
                };
            },
            {},
        );
    }, [organizationUsers, projectGroupAccess, groups]);

    const projectRoles = useMemo(() => {
        if (!projectAccess) return {};

        return projectAccess.reduce<Record<string, ProjectMemberRole>>(
            (acc, projectMember) => {
                return {
                    ...acc,
                    [projectMember.userUuid]: projectMember.role,
                };
            },
            {},
        );
    }, [projectAccess]);

    const canManageProjectAccess = ability.can(
        'manage',
        subject('Project', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    const handleUpdate = (
        orgUser: OrganizationMemberProfile,
        newRole: ProjectMemberRole,
    ) => {
        if (!canManageProjectAccess) return;

        updateAccess({
            userUuid: orgUser.userUuid,
            role: newRole,
        });
    };

    const handleDelete = (orgUser: OrganizationMemberProfile) => {
        if (!canManageProjectAccess) return;
        revokeAccess(orgUser.userUuid);
    };

    if (isProjectAccessLoading || isOrganizationUsersLoading) {
        return <LoadingState title="Loading user access" />;
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
                        {organizationUsers?.map((orgUser) => (
                            <ProjectAccessRow
                                key={orgUser.email}
                                user={orgUser}
                                organizationRole={orgRoles[orgUser.userUuid]}
                                inheritedRoles={[
                                    {
                                        type: 'organization',
                                        role: convertOrganizationRoleToProjectRole(
                                            orgRoles[orgUser.userUuid],
                                        ),
                                    },
                                    {
                                        type: 'group',
                                        role: groupRoles[orgUser.userUuid],
                                    },
                                    {
                                        type: 'project',
                                        role: projectRoles[orgUser.userUuid],
                                    },
                                ]}
                                isUpdatingAccess={isUpdatingAccess}
                                onUpdate={(newRole) =>
                                    handleUpdate(orgUser, newRole)
                                }
                                onDelete={() => handleDelete(orgUser)}
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
