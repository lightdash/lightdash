import { subject } from '@casl/ability';
import {
    convertOrganizationRoleToProjectRole,
    getHighestProjectRole,
    isGroupWithMembers,
    type OrganizationMemberRole,
    type ProjectMemberRole,
} from '@lightdash/common';
import { ActionIcon, Paper, Table, TextInput } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { useProjectGroupAccessList } from '../../features/projectGroupAccess/hooks/useProjectGroupAccess';
import { useTableStyles } from '../../hooks/styles/useTableStyles';
import { useOrganizationGroups } from '../../hooks/useOrganizationGroups';
import { useOrganizationUsers } from '../../hooks/useOrganizationUsers';
import { useProjectAccess } from '../../hooks/useProjectAccess';
import { useApp } from '../../providers/AppProvider';
import { useAbilityContext } from '../common/Authorization';
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
    } = useOrganizationUsers({ searchInput: search });

    const { data: groups } = useOrganizationGroups({ includeMembers: 5 });

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
                        {organizationUsers?.map((orgUser) => (
                            <ProjectAccessRow
                                key={orgUser.userUuid}
                                projectUuid={projectUuid}
                                canManageProjectAccess={canManageProjectAccess}
                                user={orgUser}
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
