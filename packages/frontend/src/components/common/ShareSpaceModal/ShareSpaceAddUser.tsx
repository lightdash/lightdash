import {
    FeatureFlags,
    OrganizationMemberRole,
    SpaceMemberRole,
    type OrganizationMemberProfile,
    type Space,
} from '@lightdash/common';
import {
    Badge,
    Button,
    Group,
    Loader,
    MultiSelect,
    Stack,
    Text,
    type ComboboxItem,
    type ComboboxItemGroup,
    type ComboboxLikeRenderOptionInput,
} from '@mantine-8/core';
import { useDebouncedValue } from '@mantine-8/hooks';
import { IconUsers } from '@tabler/icons-react';
import uniq from 'lodash/uniq';
import uniqBy from 'lodash/uniqBy';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { useInfiniteOrganizationGroups } from '../../../hooks/useOrganizationGroups';
import { useInfiniteOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import { useProjectAccess } from '../../../hooks/useProjectAccess';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import {
    useAddGroupSpaceShareMutation,
    useAddSpaceShareMutation,
} from '../../../hooks/useSpaces';
import { LightdashUserAvatar } from '../../Avatar';
import MantineIcon from '../MantineIcon';
import { DEFAULT_PAGE_SIZE } from '../Table/constants';
import styles from './ShareSpaceAddUser.module.css';
import { UserAccessOptions } from './ShareSpaceSelect';
import { getUserNameOrEmail } from './Utils';
import { getAccessColor } from './v2/ShareSpaceModalUtils';

interface ShareSpaceAddUserProps {
    space: Space;
    projectUuid: string;
    disabled?: boolean;
}

export const ShareSpaceAddUser: FC<ShareSpaceAddUserProps> = ({
    space,
    projectUuid,
    disabled = false,
}) => {
    const { data: nestedSpacesPermissionsFlag } = useServerFeatureFlag(
        FeatureFlags.NestedSpacesPermissions,
    );
    const isV2 = !!nestedSpacesPermissionsFlag?.enabled;

    const [selectedItems, setSelectedItems] = useState<{
        users: string[];
        groups: string[];
    }>({ users: [], groups: [] });
    const selectedValues = useMemo(
        () => [...selectedItems.users, ...selectedItems.groups],
        [selectedItems],
    );
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [debouncedSearchQuery] = useDebouncedValue(searchQuery, 300);
    const { data: projectAccess } = useProjectAccess(projectUuid);
    const viewportRef = useRef<HTMLDivElement>(null);

    const { mutateAsync: shareSpaceMutation } = useAddSpaceShareMutation(
        projectUuid,
        space.uuid,
    );
    const { mutateAsync: shareGroupSpaceMutation } =
        useAddGroupSpaceShareMutation(projectUuid, space.uuid);

    const {
        data: infiniteOrganizationGroups,
        fetchNextPage: fetchGroupsNextPage,
        hasNextPage: hasGroupsNextPage,
        isFetching: isGroupsFetching,
    } = useInfiniteOrganizationGroups(
        {
            searchInput: debouncedSearchQuery,
            includeMembers: 1,
            pageSize: DEFAULT_PAGE_SIZE,
        },
        { keepPreviousData: true },
    );

    const {
        data: infiniteOrganizationUsers,
        fetchNextPage: fetchUsersNextPage,
        hasNextPage: hasUsersNextPage,
        isFetching: isUsersFetching,
    } = useInfiniteOrganizationUsers(
        {
            searchInput: debouncedSearchQuery,
            pageSize: DEFAULT_PAGE_SIZE,
            projectUuid,
            includeGroups: 10,
        },
        { keepPreviousData: true },
    );

    // Aggregates all fetched users across pages and search queries into a unified list.
    // This ensures that previously fetched users are preserved even when the search query changes.
    // Uses 'userUuid' to remove duplicates and maintain a consistent set of unique users.
    const [allSearchedOrganizationUsers, setAllSearchedOrganizationUsers] =
        useState<OrganizationMemberProfile[]>([]);
    useEffect(() => {
        const allPages =
            infiniteOrganizationUsers?.pages.map((p) => p.data).flat() ?? [];

        setAllSearchedOrganizationUsers((previousState) =>
            uniqBy([...previousState, ...allPages], 'userUuid'),
        );
    }, [infiniteOrganizationUsers?.pages]);

    // Accumulate groups across searches so previously selected groups
    // remain resolvable even when the search query changes.
    const [allSearchedGroups, setAllSearchedGroups] = useState<
        NonNullable<typeof infiniteOrganizationGroups>['pages'][number]['data']
    >([]);
    useEffect(() => {
        const allPages =
            infiniteOrganizationGroups?.pages.map((p) => p.data).flat() ?? [];

        setAllSearchedGroups((previousState) =>
            uniqBy([...previousState, ...allPages], 'uuid'),
        );
    }, [infiniteOrganizationGroups?.pages]);

    // Set of all known group UUIDs for O(1) lookups
    const groupUuidsSet = useMemo(
        () => new Set(allSearchedGroups.map((g) => g.uuid)),
        [allSearchedGroups],
    );

    const organizationUsers = useMemo(
        () => infiniteOrganizationUsers?.pages.map((p) => p.data).flat(),
        [infiniteOrganizationUsers?.pages],
    );

    const userUuids: string[] = useMemo(() => {
        const projectUserUuids =
            projectAccess?.map((project) => project.userUuid) || [];

        const orgUserUuids =
            organizationUsers
                ?.filter((user) => user.role !== OrganizationMemberRole.MEMBER)
                .map((user) => user.userUuid) ?? [];

        return [...new Set([...projectUserUuids, ...orgUserUuids])];
    }, [organizationUsers, projectAccess]);

    const allUsersRef = useRef<Map<string, OrganizationMemberProfile>>(
        new Map(),
    );

    const data = useMemo(() => {
        // Update user ref synchronously so renderOption has access in the same render cycle
        for (const user of allSearchedOrganizationUsers) {
            allUsersRef.current.set(user.userUuid, user);
        }

        const userUuidsAndSelected = uniq([
            ...userUuids,
            ...selectedItems.users,
        ]);

        const usersSet = userUuidsAndSelected
            .map((userUuid): ComboboxItem | null => {
                const user = allSearchedOrganizationUsers.find(
                    (a) => a.userUuid === userUuid,
                );

                if (!user) return null;

                const hasDirectAccess = isV2
                    ? (space.access || []).some(
                          (access) =>
                              access.userUuid === userUuid &&
                              access.hasDirectAccess &&
                              access.inheritedFrom !== 'parent_space',
                      )
                    : !!(space.access || []).find(
                          (access) => access.userUuid === userUuid,
                      )?.hasDirectAccess;

                if (hasDirectAccess) return null;

                return {
                    value: userUuid,
                    label:
                        getUserNameOrEmail(
                            user.userUuid,
                            user.firstName,
                            user.lastName,
                            user.email,
                        ) ?? userUuid,
                };
            })
            .filter((item): item is ComboboxItem => item !== null);

        const groupsFiltered =
            allSearchedGroups.filter(
                (group) =>
                    !space.groupsAccess.some(
                        (ga) => ga.groupUuid === group.uuid,
                    ),
            ) ?? [];

        const groupItems: ComboboxItem[] = groupsFiltered.map((group) => ({
            value: group.uuid,
            label: group.name,
        }));

        const result: (ComboboxItem | ComboboxItemGroup)[] = [];

        if (isV2) {
            if (groupItems.length > 0) {
                result.push({ group: 'Groups', items: groupItems });
            }
            if (usersSet.length > 0) {
                result.push({ group: 'Users', items: usersSet });
            }
        } else {
            if (usersSet.length > 0) {
                result.push({ group: 'Users', items: usersSet });
            }
            if (groupItems.length > 0) {
                result.push({ group: 'Groups', items: groupItems });
            }
        }

        return result;
    }, [
        isV2,
        userUuids,
        selectedItems.users,
        allSearchedGroups,
        allSearchedOrganizationUsers,
        space.access,
        space.groupsAccess,
    ]);

    const isFetching = isUsersFetching || isGroupsFetching;

    const handleScrollPositionChange = useCallback(
        ({ y }: { x: number; y: number }) => {
            if (!viewportRef.current || isFetching) return;

            const { scrollHeight, clientHeight } = viewportRef.current;
            if (scrollHeight <= clientHeight) return;
            const isNearBottom = y >= scrollHeight - clientHeight - 50;

            if (isNearBottom) {
                if (hasUsersNextPage) {
                    void fetchUsersNextPage();
                }
                if (hasGroupsNextPage) {
                    void fetchGroupsNextPage();
                }
            }
        },
        [
            fetchUsersNextPage,
            fetchGroupsNextPage,
            hasUsersNextPage,
            hasGroupsNextPage,
            isFetching,
        ],
    );

    const renderOption = useCallback(
        ({ option }: ComboboxLikeRenderOptionInput<ComboboxItem>) => {
            if (groupUuidsSet.has(option.value)) {
                return (
                    <Group gap="sm" wrap="nowrap">
                        <LightdashUserAvatar size="sm" radius="xl" color="blue">
                            <MantineIcon icon={IconUsers} />
                        </LightdashUserAvatar>
                        <Text size="sm" fw={500}>
                            {option.label}
                        </Text>
                    </Group>
                );
            }

            const user = allUsersRef.current.get(option.value);
            if (!user) return option.label;

            const spaceAccess = space.access.find(
                (access) => access.userUuid === user.userUuid,
            );
            const roleTitle = spaceAccess
                ? (UserAccessOptions.find(
                      (opt) => opt.value === spaceAccess.role,
                  )?.title ?? spaceAccess.role)
                : null;

            const origin = spaceAccess
                ? spaceAccess.inheritedFrom === 'parent_space'
                    ? 'Parent'
                    : spaceAccess.inheritedFrom === 'organization'
                      ? 'Organization'
                      : spaceAccess.inheritedFrom === 'project' ||
                          spaceAccess.inheritedFrom === 'group'
                        ? 'Project'
                        : spaceAccess.inheritedFrom === 'space_group'
                          ? 'Group'
                          : 'Direct'
                : null;

            return (
                <Group gap="sm" justify="space-between" wrap="nowrap" w="100%">
                    <Group gap="sm" wrap="nowrap">
                        <LightdashUserAvatar
                            name={getUserNameOrEmail(
                                user.userUuid,
                                user.firstName,
                                user.lastName,
                                user.email,
                            )}
                            size="sm"
                            radius="xl"
                            color="blue"
                        />
                        <Stack gap={2}>
                            {user.firstName || user.lastName ? (
                                <>
                                    <Text size="sm" fw={500}>
                                        {user.firstName} {user.lastName}
                                    </Text>
                                    <Text size="xs" c="dimmed">
                                        {user.email}
                                    </Text>
                                </>
                            ) : (
                                <Text size="sm" fw={500}>
                                    {user.email}
                                </Text>
                            )}
                        </Stack>
                    </Group>

                    {spaceAccess && roleTitle && (
                        <Badge
                            size="sm"
                            variant="light"
                            color={getAccessColor(spaceAccess.role).join('.')}
                            radius="xl"
                        >
                            {origin} &middot; {roleTitle}
                        </Badge>
                    )}
                </Group>
            );
        },
        [space.access, groupUuidsSet],
    );

    const handleSelectionChange = useCallback(
        (newValue: string[]) => {
            setSelectedItems((prev) => {
                const prevAll = new Set([...prev.users, ...prev.groups]);
                const remaining = new Set(newValue);
                const added = newValue.filter((uuid) => !prevAll.has(uuid));

                return {
                    users: [
                        ...prev.users.filter((uuid) => remaining.has(uuid)),
                        ...added.filter((uuid) => !groupUuidsSet.has(uuid)),
                    ],
                    groups: [
                        ...prev.groups.filter((uuid) => remaining.has(uuid)),
                        ...added.filter((uuid) => groupUuidsSet.has(uuid)),
                    ],
                };
            });
            setSearchQuery('');
        },
        [groupUuidsSet],
    );

    const handleShare = useCallback(async () => {
        for (const uuid of selectedItems.groups) {
            const role = isV2
                ? (space.access.find((a) => a.userUuid === uuid)?.role ??
                  SpaceMemberRole.VIEWER)
                : 'viewer';
            await shareGroupSpaceMutation([uuid, role]);
        }
        for (const uuid of selectedItems.users) {
            // v2: preserve inherited role so direct access isn't a downgrade
            const role = isV2
                ? (space.access.find((a) => a.userUuid === uuid)?.role ??
                  SpaceMemberRole.VIEWER)
                : 'viewer';
            await shareSpaceMutation([uuid, role]);
        }
        setSelectedItems({ users: [], groups: [] });
    }, [
        selectedItems,
        isV2,
        space.access,
        shareGroupSpaceMutation,
        shareSpaceMutation,
    ]);

    return (
        <Group>
            <MultiSelect
                style={{ flex: 1 }}
                classNames={{ option: styles.option }}
                searchable
                clearable
                placeholder="Select groups or users to share this space with"
                nothingFoundMessage="No users found"
                searchValue={searchQuery}
                onSearchChange={setSearchQuery}
                value={selectedValues}
                onChange={handleSelectionChange}
                data={data}
                renderOption={renderOption}
                maxDropdownHeight={300}
                disabled={disabled}
                rightSection={isFetching ? <Loader size="xs" /> : null}
                scrollAreaProps={{
                    viewportRef,
                    onScrollPositionChange: handleScrollPositionChange,
                }}
                filter={({ options }) => options}
            />

            <Button
                disabled={disabled || selectedValues.length === 0}
                onClick={handleShare}
            >
                Share
            </Button>
        </Group>
    );
};
