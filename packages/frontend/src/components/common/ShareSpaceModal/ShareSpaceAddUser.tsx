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

    const [usersSelected, setUsersSelected] = useState<string[]>([]);
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

    const groups = useMemo(
        () => infiniteOrganizationGroups?.pages.map((p) => p.data).flat(),
        [infiniteOrganizationGroups?.pages],
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

    const groupItemsMap = useRef<Map<string, string>>(new Map());

    const data = useMemo(() => {
        // Update user ref synchronously so renderOption has access in the same render cycle
        for (const user of allSearchedOrganizationUsers) {
            allUsersRef.current.set(user.userUuid, user);
        }
        const userUuidsAndSelected = uniq([...userUuids, ...usersSelected]);

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
            groups?.filter(
                (group) =>
                    !space.groupsAccess.some(
                        (ga) => ga.groupUuid === group.uuid,
                    ),
            ) ?? [];

        // Track which values are group items for the Share button
        groupItemsMap.current = new Map(
            groupsFiltered.map((g) => [g.uuid, g.name]),
        );

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
        usersSelected,
        groups,
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
            if (groupItemsMap.current.has(option.value)) {
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
        [space.access],
    );

    return (
        <Group>
            <MultiSelect
                style={{ flex: 1 }}
                searchable
                clearable
                placeholder="Select groups or users to share this space with"
                nothingFoundMessage="No users found"
                searchValue={searchQuery}
                onSearchChange={setSearchQuery}
                value={usersSelected}
                onChange={(newValue) => {
                    setUsersSelected(newValue);
                    setSearchQuery('');
                }}
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
                disabled={disabled || usersSelected.length === 0}
                onClick={async () => {
                    for (const uuid of usersSelected) {
                        const isGroup = groupItemsMap.current.has(uuid);

                        // v2: preserve inherited role so direct access isn't a downgrade
                        const role = isV2
                            ? (space.access.find((a) => a.userUuid === uuid)
                                  ?.role ?? SpaceMemberRole.VIEWER)
                            : 'viewer';

                        if (isGroup) {
                            await shareGroupSpaceMutation([uuid, role]);
                        } else {
                            await shareSpaceMutation([uuid, role]);
                        }
                    }
                    setUsersSelected([]);
                }}
            >
                Share
            </Button>
        </Group>
    );
};
