import {
    ProjectMemberRole,
    ProjectMemberRoleLabels,
    ProjectRoleOrder,
    getHighestProjectRole,
} from '@lightdash/common';
import {
    Badge,
    Group,
    Loader,
    MultiSelect,
    Stack,
    Text,
    Tooltip,
    type ComboboxItem,
    type ComboboxLikeRenderOptionInput,
    type MultiSelectProps,
} from '@mantine-8/core';
import { useDebouncedValue } from '@mantine-8/hooks';
import { IconInfoCircle } from '@tabler/icons-react';
import isEmpty from 'lodash/isEmpty';
import { useCallback, useMemo, useRef, useState, type FC } from 'react';
import { LightdashUserAvatar } from '../../components/Avatar';
import MantineIcon from '../../components/common/MantineIcon';
import {
    useProjectUsersWithRoles,
    type ProjectUserWithRole,
} from '../../hooks/useProjectUsersWithRoles';

interface UserData {
    userUuid: string;
    label: string;
    firstName: string;
    lastName: string;
    email: string;
    role: ProjectMemberRole;
    roleLabel: string;
}

interface UserAccessMultiSelectProps
    extends Omit<MultiSelectProps, 'data' | 'renderOption'> {
    projectUuid: string;
    isGroupsEnabled?: boolean;
}

const transformUserData = (user: ProjectUserWithRole): UserData | null => {
    const highestRole = user.inheritedRole
        ? getHighestProjectRole(user.inheritedRole)
        : undefined;

    if (!highestRole) return null;

    const canCreateAiAgents =
        highestRole.role === ProjectMemberRole.ADMIN ||
        highestRole.role === ProjectMemberRole.DEVELOPER;

    const canInteractWithAiAgents =
        ProjectRoleOrder[highestRole.role] >=
            ProjectRoleOrder[ProjectMemberRole.INTERACTIVE_VIEWER] &&
        !canCreateAiAgents;

    if (!canInteractWithAiAgents) return null;

    return {
        userUuid: user.userUuid,
        label: `${user.firstName} ${user.lastName}`.trim() || user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: highestRole.role,
        roleLabel: ProjectMemberRoleLabels[highestRole.role],
    };
};

export const UserAccessMultiSelect: FC<UserAccessMultiSelectProps> = ({
    projectUuid,
    isGroupsEnabled = false,
    value = [],
    onChange,
    ...props
}) => {
    const [searchInput, setSearchInput] = useState<string>('');
    const [debouncedSearch] = useDebouncedValue(searchInput, 300);
    const allUsersRef = useRef<Map<string, UserData>>(new Map());

    const { usersWithProjectRole, isLoading: isLoadingUsers } =
        useProjectUsersWithRoles(projectUuid, {
            searchInput: debouncedSearch,
            paginateArgs: {
                page: 1,
                pageSize: 100,
            },
        });

    const currentSearchResults = useMemo(() => {
        const currentResults: string[] = [];

        for (const user of usersWithProjectRole) {
            const userData = transformUserData(user);
            if (!userData) continue;

            allUsersRef.current.set(userData.userUuid, userData);
            currentResults.push(userData.userUuid);
        }

        return currentResults;
    }, [usersWithProjectRole]);

    const selectData = useMemo(() => {
        const dataMap = new Map<string, { value: string; label: string }>();

        currentSearchResults.forEach((userUuid) => {
            const user = allUsersRef.current.get(userUuid);
            if (user) {
                dataMap.set(userUuid, {
                    value: user.userUuid,
                    label: user.label,
                });
            }
        });

        value.forEach((selectedUuid) => {
            if (!dataMap.has(selectedUuid)) {
                const user = allUsersRef.current.get(selectedUuid);
                if (user) {
                    dataMap.set(selectedUuid, {
                        value: user.userUuid,
                        label: user.label,
                    });
                }
            }
        });

        return Array.from(dataMap.values());
    }, [currentSearchResults, value]);

    const renderMultiSelectOption: (
        item: ComboboxLikeRenderOptionInput<ComboboxItem>,
    ) => React.ReactNode = useCallback(
        ({ option }) => {
            if (isEmpty(currentSearchResults)) {
                return (
                    <Text size="sm" c="dimmed">
                        No users found
                    </Text>
                );
            }

            const user = allUsersRef.current.get(option.value);

            if (!user) {
                return (
                    <Group gap="sm">
                        <LightdashUserAvatar name="?" size="sm" radius="xl" />
                        <Text size="sm" fw={500}>
                            {option.label}
                        </Text>
                    </Group>
                );
            }

            return (
                <Group gap="sm">
                    <LightdashUserAvatar
                        name={user.label}
                        size="sm"
                        radius="xl"
                    />
                    <Stack gap="two">
                        <Group gap="xs">
                            <Text size="sm" fw={500}>
                                {user.label}
                            </Text>
                            <Badge
                                size="xs"
                                p="2px 4px"
                                radius="sm"
                                variant="outline"
                                color="ldGray.6"
                                fz="8px"
                            >
                                {user.roleLabel}
                            </Badge>
                        </Group>
                        <Text size="xs" c="dimmed" fw={400}>
                            {user.email}
                        </Text>
                    </Stack>
                </Group>
            );
        },
        [currentSearchResults],
    );

    return (
        <MultiSelect
            variant="subtle"
            renderOption={renderMultiSelectOption}
            hidePickedOptions
            label={
                <Group gap="xs">
                    <Text fz="sm" fw={500}>
                        User Access
                    </Text>
                    <Tooltip
                        label="Admins and developers will always have access."
                        withArrow
                        withinPortal
                        multiline
                        position="right"
                        maw="250px"
                    >
                        <MantineIcon icon={IconInfoCircle} />
                    </Tooltip>
                </Group>
            }
            description={`Select specific users from this project who can access this agent. ${
                isGroupsEnabled
                    ? 'If no users are selected, access will be determined by group settings.'
                    : ''
            }`}
            placeholder="Search users"
            data={selectData}
            clearable
            searchable
            readOnly={isLoadingUsers}
            rightSection={isLoadingUsers && <Loader size="xs" />}
            limit={100}
            comboboxProps={{
                transitionProps: {
                    transition: 'pop',
                    duration: 200,
                },
            }}
            value={value}
            onChange={(newValue) => {
                onChange?.(newValue.length > 0 ? newValue : []);
            }}
            onSearchChange={setSearchInput}
            {...props}
        />
    );
};
