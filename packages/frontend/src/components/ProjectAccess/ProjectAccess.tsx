import { subject } from '@casl/ability';
import {
    ProjectMemberRole,
    convertOrganizationRoleToProjectRole,
    convertProjectRoleToOrganizationRole,
    getHighestProjectRole,
    isGroupWithMembers,
    type InheritedRoles,
    type OrganizationMemberRole,
} from '@lightdash/common';
import { ActionIcon, Paper, Table, TextInput } from '@mantine/core';
import { IconSearch, IconX } from '@tabler/icons-react';
import Fuse from 'fuse.js';
import { useMemo, useState, type FC } from 'react';
import { useProjectGroupAccessList } from '../../features/projectGroupAccess/hooks/useProjectGroupAccess';
import { useTableStyles } from '../../hooks/styles/useTableStyles';
import { useOrganizationGroups } from '../../hooks/useOrganizationGroups';
import { useOrganizationUsers } from '../../hooks/useOrganizationUsers';
import { useProjectAccess } from '../../hooks/useProjectAccess';
import { useAbilityContext } from '../../providers/Ability/useAbilityContext';
import useApp from '../../providers/App/useApp';
import LoadingState from '../common/LoadingState';
import MantineIcon from '../common/MantineIcon';
import { SettingsCard } from '../common/Settings/SettingsCard';
import CreateProjectAccessModal from './CreateProjectAccessModal';
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
    const ability = useAbilityContext();

    const { cx, classes } = useTableStyles();

    const [search, setSearch] = useState('');

    const {
        data: organizationUsers,
        isInitialLoading: isOrganizationUsersLoading,
    } = useOrganizationUsers();

    const { data: groups } = useOrganizationGroups({ includeMembers: 5 });

    const { data: projectAccess, isInitialLoading: isProjectAccessLoading } =
        useProjectAccess(projectUuid);

    const { data: projectGroupAccess } = useProjectGroupAccessList(projectUuid);

    const orgRoles = useMemo(() => {
        if (!organizationUsers || !projectAccess) return undefined;

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
                    if (!group || !isGroupWithMembers(group)) return userRoles;
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

    const inheritedRoles = useMemo(() => {
        // Organization users and org roles are not always available, and we don't want to show the user access page if they are not available
        if (!organizationUsers || !orgRoles) return undefined;
        return organizationUsers.reduce<Record<string, InheritedRoles>>(
            (acc, orgUser) => {
                return {
                    ...acc,
                    [orgUser.userUuid]: [
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
                    ],
                };
            },
            {},
        );
    }, [organizationUsers, orgRoles, groupRoles, projectRoles]);

    const usersWithProjectRole = useMemo(() => {
        if (!organizationUsers || !inheritedRoles) return [];

        return organizationUsers.map((orgUser) => {
            const highestRole = getHighestProjectRole(
                inheritedRoles[orgUser.userUuid],
            );
            const hasProjectRole = !!projectRoles[orgUser.userUuid];
            const inheritedRole = highestRole?.role
                ? convertProjectRoleToOrganizationRole(highestRole.role)
                : orgUser.role;
            return {
                ...orgUser,
                finalRole: hasProjectRole
                    ? convertProjectRoleToOrganizationRole(
                          projectRoles[orgUser.userUuid] ||
                              ProjectMemberRole.VIEWER,
                      )
                    : inheritedRole,
                inheritedRole: inheritedRoles?.[orgUser.userUuid],
            };
        });
    }, [organizationUsers, projectRoles, inheritedRoles]);

    const filteredUsers = useMemo(() => {
        if (search && usersWithProjectRole) {
            return new Fuse(usersWithProjectRole, {
                keys: ['firstName', 'lastName', 'email', 'finalRole'],
                ignoreLocation: true,
                threshold: 0.3,
            })
                .search(search)
                .map((result) => ({
                    ...result.item,
                    inheritedRole: inheritedRoles?.[result.item.userUuid],
                }));
        }
        return usersWithProjectRole;
    }, [usersWithProjectRole, search, inheritedRoles]);

    if (isProjectAccessLoading || isOrganizationUsersLoading) {
        return <LoadingState title="Loading user access" />;
    }

    return (
        <>
            <SettingsCard shadow="none" p={0}>
                <Paper p="sm">
                    <TextInput
                        size="xs"
                        placeholder="Search users by name, email, or role"
                        onChange={(e) => setSearch(e.target.value)}
                        value={search}
                        w={320}
                        icon={<MantineIcon icon={IconSearch} />}
                        sx={(theme) => ({
                            input: {
                                boxShadow: theme.shadows.subtle,
                            },
                        })}
                        rightSection={
                            search.length > 0 && (
                                <ActionIcon onClick={() => setSearch('')}>
                                    <MantineIcon icon={IconX} />
                                </ActionIcon>
                            )
                        }
                    />
                </Paper>

                <Table className={cx(classes.root, classes.alignLastTdRight)}>
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Role</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredUsers?.map((orgUser) => (
                            <ProjectAccessRow
                                key={orgUser.userUuid}
                                projectUuid={projectUuid}
                                canManageProjectAccess={canManageProjectAccess}
                                user={orgUser}
                                inheritedRoles={orgUser.inheritedRole}
                            />
                        ))}
                    </tbody>
                </Table>
            </SettingsCard>

            {isAddingProjectAccess && (
                <CreateProjectAccessModal
                    projectUuid={projectUuid}
                    onClose={() => onAddProjectAccessClose()}
                />
            )}
        </>
    );
};

export default ProjectAccess;
