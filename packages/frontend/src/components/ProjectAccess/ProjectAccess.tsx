import { subject } from '@casl/ability';
import {
    ProjectMemberRole,
    ProjectMemberRoleLabels,
    type Role,
} from '@lightdash/common';
import { ActionIcon, Paper, Table, TextInput } from '@mantine/core';
import { IconSearch, IconX } from '@tabler/icons-react';
import Fuse from 'fuse.js';
import { useMemo, useState, type FC } from 'react';
import { useTableStyles } from '../../hooks/styles/useTableStyles';
import {
    useOrganizationRoleAssignments,
    useOrganizationRoles,
} from '../../hooks/useOrganizationRoles';
import { useProjectUsersWithRolesV2 } from '../../hooks/useProjectUsersWithRolesV2';
import { useAbilityContext } from '../../providers/Ability/useAbilityContext';
import useApp from '../../providers/App/useApp';
import LoadingState from '../common/LoadingState';
import MantineIcon from '../common/MantineIcon';
import { SettingsCard } from '../common/Settings/SettingsCard';
import CreateProjectAccessModal from './CreateProjectAccessModal';
import ProjectAccessRowV2 from './ProjectAccessRowV2';

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

    const { usersWithProjectRole, isLoading } =
        useProjectUsersWithRolesV2(projectUuid);

    const { data: organizationRoles } = useOrganizationRoles();
    const { data: organizationRoleAssignments } =
        useOrganizationRoleAssignments();

    const rolesData = useMemo(() => {
        // TODO: Remove this once we have a proper system role
        // Keep this as fallback for now
        if (!organizationRoles)
            return Object.values(ProjectMemberRole).map((role) => ({
                value: role,
                label: ProjectMemberRoleLabels[role],
                group: 'System role',
            }));
        return organizationRoles.map(
            (role: Pick<Role, 'roleUuid' | 'name' | 'ownerType'>) => ({
                value: role.roleUuid,
                label: role.name,
                group:
                    role.ownerType === 'system' ? 'System role' : 'Custom role',
            }),
        );
    }, [organizationRoles]);
    const canManageProjectAccess = ability.can(
        'manage',
        subject('Project', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    const filteredUsers = useMemo(() => {
        if (search && usersWithProjectRole) {
            return new Fuse(usersWithProjectRole, {
                keys: ['firstName', 'lastName', 'email', 'role', 'projectRole'],
                ignoreLocation: true,
                threshold: 0.3,
            })
                .search(search)
                .map((result) => result.item);
        }
        return usersWithProjectRole;
    }, [usersWithProjectRole, search]);

    if (isLoading) {
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
                            <ProjectAccessRowV2
                                key={orgUser.userUuid}
                                projectUuid={projectUuid}
                                canManageProjectAccess={canManageProjectAccess}
                                user={orgUser}
                                organizationRoles={rolesData}
                                organizationRoleAssignments={
                                    organizationRoleAssignments || []
                                }
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
