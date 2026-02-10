import { subject } from '@casl/ability';
import { OrganizationMemberRole, type Role } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Flex,
    Group,
    Pagination,
    Paper,
    Table,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { Menu } from '@mantine-8/core';
import { IconCheck, IconDots, IconInfoCircle, IconSearch, IconX } from '@tabler/icons-react';
import Fuse from 'fuse.js';
import { useEffect, useMemo, useState, type FC } from 'react';
import { useTableStyles } from '../../hooks/styles/useTableStyles';
import { useOrganizationGroups } from '../../hooks/useOrganizationGroups';
import {
    useOrganizationRoleAssignments,
    useOrganizationRoles,
} from '../../hooks/useOrganizationRoles';
import { useProjectUsersWithRoles } from '../../hooks/useProjectUsersWithRolesV2';
import { useAbilityContext } from '../../providers/Ability/useAbilityContext';
import useApp from '../../providers/App/useApp';
import LoadingState from '../common/LoadingState';
import MantineIcon from '../common/MantineIcon';
import { SettingsCard } from '../common/Settings/SettingsCard';
import { DEFAULT_PAGE_SIZE } from '../common/Table/constants';
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
    const [page, setPage] = useState(1);
    const [showMembersOnly, setShowMembersOnly] = useState(false);

    const { usersWithProjectRole, groupRoles, isLoading } =
        useProjectUsersWithRoles(projectUuid);

    const { data: organizationRoles, isLoading: isLoadingOrganizationRoles } =
        useOrganizationRoles();
    const {
        data: organizationRoleAssignments,
        isLoading: isLoadingOrganizationRoleAssignments,
    } = useOrganizationRoleAssignments();

    // Fetch organization groups to check for inherited group access
    const { data: organizationGroups } = useOrganizationGroups({
        includeMembers: 2000,
    });

    const rolesData = useMemo(() => {
        return organizationRoles?.map(
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

    // Reset page when search or filter changes
    useEffect(() => {
        setPage(1);
    }, [search, showMembersOnly]);

    // Filter out members without project roles when showMembersOnly is false
    const usersAfterMemberFilter = useMemo(() => {
        if (!usersWithProjectRole) return [];
        if (showMembersOnly) return usersWithProjectRole;

        // Hide users who are members at org level and don't have a direct project role
        return usersWithProjectRole.filter((u) => {
            const isMemberOnly =
                u.role === OrganizationMemberRole.MEMBER && !u.projectRole;
            return !isMemberOnly;
        });
    }, [usersWithProjectRole, showMembersOnly]);

    // Count of hidden members (for info display)
    const hiddenMembersCount = useMemo(() => {
        if (!usersWithProjectRole) return 0;
        return usersWithProjectRole.filter(
            (u) => u.role === OrganizationMemberRole.MEMBER && !u.projectRole,
        ).length;
    }, [usersWithProjectRole]);

    const filteredUsers = useMemo(() => {
        if (search && usersAfterMemberFilter) {
            return new Fuse(usersAfterMemberFilter, {
                keys: ['firstName', 'lastName', 'email', 'role', 'projectRole'],
                ignoreLocation: true,
                threshold: 0.3,
            })
                .search(search)
                .map((result) => result.item);
        }
        return usersAfterMemberFilter;
    }, [usersAfterMemberFilter, search]);

    // Pagination logic
    const paginatedUsers = !filteredUsers
        ? []
        : (() => {
              const startIndex = (page - 1) * DEFAULT_PAGE_SIZE;
              const endIndex = startIndex + DEFAULT_PAGE_SIZE;
              return filteredUsers.slice(startIndex, endIndex);
          })();

    const totalPages = !filteredUsers
        ? 1
        : Math.ceil(filteredUsers.length / DEFAULT_PAGE_SIZE);

    if (
        isLoading ||
        isLoadingOrganizationRoles ||
        isLoadingOrganizationRoleAssignments
    ) {
        return <LoadingState title="Loading user access" />;
    }

    return (
        <>
            <SettingsCard shadow="none" p={0}>
                <Paper p="sm">
                    <Group position="apart">
                        <TextInput
                            data-testid="org-users-search-input"
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
                        {hiddenMembersCount > 0 && (
                            <Menu withinPortal position="bottom-end">
                                <Menu.Target>
                                    <Tooltip
                                        withinPortal
                                        label="View options"
                                    >
                                        <ActionIcon
                                            variant="subtle"
                                            color="ldGray.6"
                                            size="sm"
                                        >
                                            <MantineIcon icon={IconDots} />
                                        </ActionIcon>
                                    </Tooltip>
                                </Menu.Target>
                                <Menu.Dropdown>
                                    <Menu.Item
                                        leftSection={
                                            showMembersOnly ? (
                                                <MantineIcon
                                                    icon={IconCheck}
                                                    size="sm"
                                                />
                                            ) : (
                                                <Box w={16} />
                                            )
                                        }
                                        onClick={() =>
                                            setShowMembersOnly(!showMembersOnly)
                                        }
                                    >
                                        Show members ({hiddenMembersCount})
                                    </Menu.Item>
                                    <Menu.Item
                                        leftSection={
                                            <MantineIcon
                                                icon={IconInfoCircle}
                                                size="sm"
                                                color="ldGray.6"
                                            />
                                        }
                                        disabled
                                    >
                                        <Text
                                            size="xs"
                                            c="ldGray.6"
                                            maw={260}
                                        >
                                            Members have no project access by
                                            default. They only see content if
                                            given a role at project or group
                                            level.
                                        </Text>
                                    </Menu.Item>
                                </Menu.Dropdown>
                            </Menu>
                        )}
                    </Group>
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
                        {paginatedUsers?.map((orgUser) => (
                            <ProjectAccessRowV2
                                key={orgUser.userUuid}
                                projectUuid={projectUuid}
                                canManageProjectAccess={canManageProjectAccess}
                                user={orgUser}
                                organizationRoles={rolesData || []}
                                organizationRoleAssignments={
                                    organizationRoleAssignments || []
                                }
                                organizationGroups={organizationGroups || []}
                                groupRoles={groupRoles || []}
                            />
                        ))}
                    </tbody>
                </Table>
                {totalPages > 1 && (
                    <Flex m="sm" align="center" justify="center">
                        <Pagination
                            size="sm"
                            value={page}
                            onChange={setPage}
                            total={totalPages}
                            mt="sm"
                        />
                    </Flex>
                )}
            </SettingsCard>

            {isAddingProjectAccess && (
                <CreateProjectAccessModal
                    projectUuid={projectUuid}
                    roles={rolesData || []}
                    onClose={() => onAddProjectAccessClose()}
                />
            )}
        </>
    );
};

export default ProjectAccess;
