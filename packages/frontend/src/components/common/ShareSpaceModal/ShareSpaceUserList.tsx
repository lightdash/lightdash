import {
    ProjectMemberRole,
    SpaceMemberRole,
    type LightdashUser,
    type Space,
    type SpaceGroup,
    type SpaceShare,
} from '@lightdash/common';
import {
    ActionIcon,
    Avatar,
    Badge,
    Button,
    Collapse,
    Group,
    Paper,
    Select,
    Stack,
    Text,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import { useDisclosure, useHover } from '@mantine/hooks';
import {
    IconAlertCircle,
    IconBuildingBank,
    IconChevronDown,
    IconChevronUp,
    IconDatabase,
    IconFolder,
    IconUsers,
    type Icon as TablerIconType,
} from '@tabler/icons-react';
import chunk from 'lodash/chunk';
import { forwardRef, useCallback, useMemo, useState, type FC } from 'react';
import useToaster from '../../../hooks/toaster/useToaster';
import {
    useAddGroupSpaceShareMutation,
    useAddSpaceShareMutation,
    useClearAllSpaceAccessMutation,
    useDeleteSpaceGroupAccessMutation,
    useDeleteSpaceShareMutation,
} from '../../../hooks/useSpaces';
import MantineIcon from '../MantineIcon';
import PaginateControl from '../PaginateControl';
import { DEFAULT_PAGE_SIZE } from '../Table/constants';
import {
    UserAccessAction,
    UserAccessOptions,
    type AccessOption,
} from './ShareSpaceSelect';
import { getInitials, getUserNameOrEmail } from './Utils';

export interface ShareSpaceUserListProps {
    space: Space;
    sessionUser: LightdashUser | undefined;
    projectUuid: string;
    disabled?: boolean;
}

const UserAccessSelectItem = forwardRef<HTMLDivElement, AccessOption>(
    (
        {
            title,
            selectDescription,
            ...others
        }: React.ComponentPropsWithoutRef<'div'> & AccessOption,
        ref,
    ) => (
        <Stack ref={ref} {...others} spacing={1}>
            <Text fz="sm">{title}</Text>
            <Text fz="xs" opacity={0.65}>
                {selectDescription}
            </Text>
        </Stack>
    ),
);

const sortByRole =
    (sessionUserUuid: string | undefined) => (a: SpaceShare, b: SpaceShare) => {
        const roleOrder = [
            SpaceMemberRole.VIEWER,
            SpaceMemberRole.EDITOR,
            SpaceMemberRole.ADMIN,
        ];
        const aRole = roleOrder.indexOf(a.role);
        const bRole = roleOrder.indexOf(b.role);
        // order by session user
        if (a.userUuid === sessionUserUuid) return -1;
        if (b.userUuid === sessionUserUuid) return 1;
        // order by role
        if (aRole > bRole) return -1;
        if (aRole < bRole) return 1;
        return 0;
    };

type ListCollapseProps = {
    icon: TablerIconType;
    label: string;
    accessCount: number;
};

const ListCollapse: FC<React.PropsWithChildren<ListCollapseProps>> = ({
    icon,
    label,
    accessCount,
    children,
}) => {
    const { hovered, ref } = useHover();
    const theme = useMantineTheme();
    const [isOpen, { toggle }] = useDisclosure(false);
    return (
        <Paper withBorder={isOpen}>
            <Group
                ref={ref}
                position="apart"
                spacing="sm"
                noWrap
                bg={hovered || isOpen ? theme.colors.ldGray[0] : undefined}
                sx={{ cursor: 'pointer' }}
                onClick={toggle}
            >
                <Group spacing="xs">
                    <Avatar size={'sm'} radius="xl" color="gray">
                        <MantineIcon icon={icon} size={'sm'} radius="xl" />
                    </Avatar>
                    <Text fw={600} fz="sm">
                        {label}{' '}
                        <Text fw={400} span c="ldGray.6">
                            ({accessCount})
                        </Text>
                    </Text>
                </Group>
                <ActionIcon variant="subtle">
                    <MantineIcon
                        icon={isOpen ? IconChevronUp : IconChevronDown}
                    />
                </ActionIcon>
            </Group>
            <Collapse in={isOpen} p={'xs'}>
                {children}
            </Collapse>
        </Paper>
    );
};

type UserAccessListProps = {
    isPrivate: boolean;
    accessList: SpaceShare[];
    sessionUser: LightdashUser | undefined;
    onAccessChange: (
        action: UserAccessAction,
        currentUserAccess: SpaceShare,
    ) => void;
    pageSize?: number;
    disabled?: boolean;
};
const UserAccessList: FC<UserAccessListProps> = ({
    isPrivate,
    accessList,
    sessionUser,
    onAccessChange,
    pageSize,
    disabled = false,
}) => {
    const [page, setPage] = useState(1);

    // TODO: Paginate space access from backend
    const paginatedList: SpaceShare[][] = useMemo(() => {
        const sortedList = structuredClone(accessList).sort(
            sortByRole(sessionUser?.userUuid),
        );

        return chunk(sortedList, pageSize ?? DEFAULT_PAGE_SIZE);
    }, [accessList, pageSize, sessionUser?.userUuid]);

    const handleNextPage = useCallback(() => {
        if (page < paginatedList.length) {
            setPage((prev) => prev + 1);
        }
    }, [page, paginatedList.length]);

    const handlePreviousPage = useCallback(() => {
        if (page > 1) {
            setPage((prev) => prev - 1);
        }
    }, [page]);

    return (
        <Stack spacing="sm">
            {paginatedList[page - 1]?.map((sharedUser) => {
                const needsToBePromotedToInteractiveViewer =
                    sharedUser.projectRole === ProjectMemberRole.VIEWER &&
                    sharedUser.role !== SpaceMemberRole.VIEWER;
                const isSessionUser =
                    sharedUser.userUuid === sessionUser?.userUuid;

                const userAccessTypes = UserAccessOptions.filter(
                    (accessType) =>
                        accessType.value !== UserAccessAction.DELETE ||
                        sharedUser.hasDirectAccess,
                ).map((accessType) =>
                    accessType.value === UserAccessAction.DELETE && !isPrivate
                        ? {
                              ...accessType,
                              title: 'Reset access',
                              selectDescription: `Reset user's access`,
                          }
                        : accessType,
                );

                return (
                    <Group
                        key={sharedUser.userUuid}
                        spacing="sm"
                        position="apart"
                        noWrap
                    >
                        <Group>
                            <Avatar
                                size={'sm'}
                                radius="xl"
                                tt="uppercase"
                                color="blue"
                            >
                                {getInitials(
                                    sharedUser.userUuid,
                                    sharedUser.firstName,
                                    sharedUser.lastName,
                                    sharedUser.email,
                                )}
                            </Avatar>

                            <Text fw={600} fz="sm">
                                {getUserNameOrEmail(
                                    sharedUser.userUuid,
                                    sharedUser.firstName,
                                    sharedUser.lastName,
                                    sharedUser.email,
                                )}
                                {isSessionUser ? (
                                    <Text fw={400} span c="ldGray.6">
                                        {' '}
                                        (you)
                                    </Text>
                                ) : null}
                            </Text>
                        </Group>
                        {isSessionUser ||
                        (!sharedUser.hasDirectAccess &&
                            sharedUser.inheritedRole ===
                                ProjectMemberRole.ADMIN) ? (
                            <Badge
                                size="xs"
                                color="ldGray.6"
                                radius="xs"
                                mr={'xs'}
                            >
                                {UserAccessOptions.find(
                                    (option) =>
                                        option.value === sharedUser.role,
                                )?.title ?? sharedUser.role}
                            </Badge>
                        ) : (
                            <Tooltip
                                disabled={!needsToBePromotedToInteractiveViewer}
                                withinPortal
                                label="User needs to be promoted to interactive viewer to have this space access"
                                maw={350}
                                multiline
                            >
                                <Select
                                    styles={{
                                        input: {
                                            fontWeight: 500,
                                            textAlign: 'right',
                                        },
                                        rightSection: {
                                            pointerEvents: 'none',
                                        },
                                    }}
                                    size="xs"
                                    variant="unstyled"
                                    withinPortal
                                    data={userAccessTypes.map((u) => ({
                                        label: u.title,
                                        ...u,
                                    }))}
                                    value={sharedUser.role}
                                    itemComponent={UserAccessSelectItem}
                                    onChange={(userAccessOption) => {
                                        if (userAccessOption) {
                                            onAccessChange(
                                                userAccessOption as UserAccessAction,
                                                sharedUser,
                                            );
                                        }
                                    }}
                                    error={needsToBePromotedToInteractiveViewer}
                                    rightSection={
                                        needsToBePromotedToInteractiveViewer ? (
                                            <MantineIcon
                                                icon={IconAlertCircle}
                                                size="sm"
                                                color="red.6"
                                            />
                                        ) : null
                                    }
                                    disabled={disabled}
                                />
                            </Tooltip>
                        )}
                    </Group>
                );
            })}
            {paginatedList.length > 1 && (
                <PaginateControl
                    currentPage={page}
                    totalPages={paginatedList.length}
                    hasNextPage={page < paginatedList.length}
                    hasPreviousPage={page > 1}
                    onNextPage={handleNextPage}
                    onPreviousPage={handlePreviousPage}
                    style={{ alignSelf: 'flex-end' }}
                />
            )}
        </Stack>
    );
};

type GroupAccessListProps = {
    disabled?: boolean;
    isPrivate: boolean;
    groupsAccess: SpaceGroup[];
    onAccessChange: (
        action: UserAccessAction,
        currentGroupAccess: SpaceGroup,
    ) => void;
    pageSize?: number;
};
const GroupsAccessList: FC<GroupAccessListProps> = ({
    disabled = false,
    isPrivate,
    onAccessChange,
    groupsAccess,
    pageSize,
}) => {
    const [page, setPage] = useState(1);

    // TODO: Paginate group access from backend
    const paginatedList: SpaceGroup[][] = useMemo(() => {
        const sortedList = structuredClone(groupsAccess);

        return chunk(sortedList, pageSize ?? DEFAULT_PAGE_SIZE);
    }, [groupsAccess, pageSize]);

    const handleNextPage = useCallback(() => {
        if (page < paginatedList.length) {
            setPage((prev) => prev + 1);
        }
    }, [page, paginatedList.length]);

    const handlePreviousPage = useCallback(() => {
        if (page > 1) {
            setPage((prev) => prev - 1);
        }
    }, [page]);

    return (
        <Stack spacing="sm">
            {paginatedList[page - 1]?.map((group) => {
                const userAccessTypes = UserAccessOptions.map((accessType) =>
                    accessType.value === UserAccessAction.DELETE
                        ? {
                              ...accessType,
                              title: isPrivate
                                  ? 'Remove access'
                                  : 'Reset access',
                              selectDescription: isPrivate
                                  ? `Remove group's access`
                                  : `Reset group's access`,
                          }
                        : accessType,
                );

                return (
                    <Group
                        key={group.groupUuid}
                        spacing="sm"
                        position="apart"
                        noWrap
                    >
                        <Group>
                            <Avatar size={'sm'} radius="xl" color="blue">
                                <MantineIcon
                                    icon={IconUsers}
                                    size={'sm'}
                                    radius="xl"
                                />
                            </Avatar>
                            <Text fw={600} fz="sm">
                                {group.groupName}
                            </Text>
                        </Group>

                        <Select
                            styles={{
                                input: {
                                    fontWeight: 500,
                                    textAlign: 'right',
                                },
                                rightSection: {
                                    pointerEvents: 'none',
                                },
                            }}
                            size="xs"
                            variant="unstyled"
                            withinPortal
                            data={userAccessTypes.map((u) => ({
                                label: u.title,
                                ...u,
                            }))}
                            value={group.spaceRole}
                            itemComponent={UserAccessSelectItem}
                            onChange={(userAccessOption) => {
                                if (userAccessOption) {
                                    onAccessChange(
                                        userAccessOption as UserAccessAction,
                                        group,
                                    );
                                }
                            }}
                            disabled={disabled}
                        />
                    </Group>
                );
            })}
            {paginatedList.length > 1 && (
                <PaginateControl
                    currentPage={page}
                    totalPages={paginatedList.length}
                    hasNextPage={page < paginatedList.length}
                    hasPreviousPage={page > 1}
                    onNextPage={handleNextPage}
                    onPreviousPage={handlePreviousPage}
                    style={{ alignSelf: 'flex-end' }}
                />
            )}
        </Stack>
    );
};

type SpaceAccessByType = {
    project: SpaceShare[];
    organisation: SpaceShare[];
    parentSpace: SpaceShare[];
    direct: SpaceShare[];
};

export const ShareSpaceUserList: FC<ShareSpaceUserListProps> = ({
    space,
    projectUuid,
    sessionUser,
    disabled = false,
}) => {
    const { showToastError } = useToaster();
    const { mutate: unshareSpaceMutation } = useDeleteSpaceShareMutation(
        projectUuid,
        space.uuid,
    );

    const { mutate: shareSpaceMutation } = useAddSpaceShareMutation(
        projectUuid,
        space.uuid,
    );

    const { mutate: unshareGroupSpaceAccessMutation } =
        useDeleteSpaceGroupAccessMutation(projectUuid, space.uuid);

    const { mutate: shareGroupSpaceMutation } = useAddGroupSpaceShareMutation(
        projectUuid,
        space.uuid,
    );

    const { mutate: clearAllAccess, isLoading: isClearingAccess } =
        useClearAllSpaceAccessMutation(projectUuid, space.uuid);

    const handleAccessChange = useCallback(
        (userAccessOption: UserAccessAction, sharedUser: SpaceShare) => {
            if (userAccessOption === UserAccessAction.DELETE) {
                unshareSpaceMutation(sharedUser.userUuid);
            } else {
                if (
                    sharedUser.inheritedRole === ProjectMemberRole.ADMIN &&
                    userAccessOption !== UserAccessAction.ADMIN
                ) {
                    showToastError({
                        title: `Failed to update user access`,
                        subtitle: `An admin can not be a space ${userAccessOption}`,
                    });
                    return;
                }

                shareSpaceMutation([
                    sharedUser.userUuid,
                    userAccessOption
                        ? userAccessOption
                        : SpaceMemberRole.VIEWER, // default to viewer role for new private space member
                ]);
            }
        },
        [unshareSpaceMutation, shareSpaceMutation, showToastError],
    );

    const handleGroupAccessChange = useCallback(
        (userAccessOption: UserAccessAction, group: SpaceGroup) => {
            if (userAccessOption === UserAccessAction.DELETE) {
                unshareGroupSpaceAccessMutation(group.groupUuid);
            } else {
                if (
                    group.spaceRole === SpaceMemberRole.ADMIN &&
                    userAccessOption !== UserAccessAction.ADMIN
                ) {
                    showToastError({
                        title: `Failed to update user access`,
                        subtitle: `An admin can not be a space ${userAccessOption}`,
                    });
                    return;
                }

                shareGroupSpaceMutation([
                    group.groupUuid,
                    userAccessOption
                        ? userAccessOption
                        : SpaceMemberRole.VIEWER, // default to viewer role for new private space member
                ]);
            }
        },
        [
            unshareGroupSpaceAccessMutation,
            shareGroupSpaceMutation,
            showToastError,
        ],
    );

    const accessByType = useMemo<SpaceAccessByType>(() => {
        const getDirectOrHighestAccess = (
            existing: SpaceShare,
            current: SpaceShare,
        ) => {
            const roleOrder = {
                // higher roles have higher numbers
                [SpaceMemberRole.VIEWER]: 1,
                [SpaceMemberRole.EDITOR]: 2,
                [SpaceMemberRole.ADMIN]: 3,
            };

            // if one has direct access, return it
            if (existing.hasDirectAccess !== current.hasDirectAccess) {
                if (existing.hasDirectAccess) {
                    return existing;
                } else {
                    return current;
                }
            }
            // otherwise, return the one with the highest role
            const existingRoleNumber = roleOrder[existing.role];
            const currentRoleNumber = roleOrder[current.role];
            return currentRoleNumber > existingRoleNumber ? current : existing;
        };

        const userAccessMap = space.access.reduce<Map<string, SpaceShare>>(
            (acc, spaceShare) => {
                const existing = acc.get(spaceShare.userUuid);
                acc.set(
                    spaceShare.userUuid,
                    existing
                        ? getDirectOrHighestAccess(existing, spaceShare)
                        : spaceShare,
                );
                return acc;
            },
            new Map<string, SpaceShare>(),
        );

        // Inheritance display logic:
        // - inherit=false: Only show direct permissions (no inherited sections)
        // - inherit=true + nested: All inherited → "From parent space"
        // - inherit=true + root: Show actual sources (project/org)
        const isNestedSpace = !!space.parentSpaceUuid;
        const showInheritedPermissions = space.inheritParentPermissions;
        const isNestedWithInheritance =
            isNestedSpace && space.inheritParentPermissions;

        const result = Array.from(userAccessMap.values()).reduce<{
            project: SpaceShare[];
            organisation: SpaceShare[];
            parentSpace: SpaceShare[];
            direct: SpaceShare[];
        }>(
            (acc, spaceShare) => {
                if (spaceShare.hasDirectAccess) {
                    acc.direct.push(spaceShare);
                } else if (!showInheritedPermissions) {
                    // inherit=false: Don't show inherited permissions at all
                    // (they still have access but we only show explicit permissions)
                } else if (isNestedWithInheritance) {
                    // Nested space with inheritance: all inherited permissions come from parent
                    acc.parentSpace.push(spaceShare);
                } else if (spaceShare.inheritedFrom === 'parent_space') {
                    acc.parentSpace.push(spaceShare);
                } else if (
                    spaceShare.inheritedFrom === 'project' ||
                    spaceShare.inheritedFrom === 'group'
                ) {
                    acc.project.push(spaceShare);
                } else if (spaceShare.inheritedFrom === 'organization') {
                    acc.organisation.push(spaceShare);
                }
                return acc;
            },
            {
                project: [],
                organisation: [],
                parentSpace: [],
                direct: [],
            },
        );

        return {
            project: result.project,
            organisation: result.organisation,
            parentSpace: result.parentSpace,
            direct: result.direct,
        };
    }, [space]);

    const hasInheritedAccess =
        accessByType.organisation.length > 0 ||
        accessByType.project.length > 0 ||
        accessByType.parentSpace.length > 0;

    const hasDirectAccess =
        accessByType.direct.length > 0 || space.groupsAccess.length > 0;

    const handleClearAll = () => {
        clearAllAccess();
    };

    return (
        <Stack spacing={'xs'}>
            {/* Inherited access section - only shown when inherit=true */}
            {hasInheritedAccess && (
                <>
                    <Text fw={400} span c="ldGray.6">
                        Inherited access (read-only)
                    </Text>
                    {accessByType.parentSpace.length > 0 && (
                        <ListCollapse
                            icon={IconFolder}
                            label="From parent space"
                            accessCount={accessByType.parentSpace.length}
                        >
                            <UserAccessList
                                isPrivate={space.isPrivate}
                                accessList={accessByType.parentSpace}
                                sessionUser={sessionUser}
                                onAccessChange={handleAccessChange}
                                disabled={true}
                            />
                        </ListCollapse>
                    )}
                    {accessByType.organisation.length > 0 && (
                        <ListCollapse
                            icon={IconBuildingBank}
                            label="From organisation"
                            accessCount={accessByType.organisation.length}
                        >
                            <UserAccessList
                                isPrivate={space.isPrivate}
                                accessList={accessByType.organisation}
                                sessionUser={sessionUser}
                                onAccessChange={handleAccessChange}
                                disabled={true}
                            />
                        </ListCollapse>
                    )}
                    {accessByType.project.length > 0 && (
                        <ListCollapse
                            icon={IconDatabase}
                            label="From project"
                            accessCount={accessByType.project.length}
                        >
                            <UserAccessList
                                isPrivate={space.isPrivate}
                                accessList={accessByType.project}
                                sessionUser={sessionUser}
                                onAccessChange={handleAccessChange}
                                disabled={true}
                            />
                        </ListCollapse>
                    )}
                </>
            )}

            {/* Direct/Additional access section */}
            {hasDirectAccess && (
                <>
                    <Group position="apart">
                        <Text fw={400} span c="ldGray.6">
                            {hasInheritedAccess
                                ? 'Additional permissions'
                                : 'Space permissions'}
                        </Text>
                        {!disabled && (
                            <Button
                                variant="subtle"
                                color="red"
                                size="xs"
                                compact
                                onClick={handleClearAll}
                                loading={isClearingAccess}
                            >
                                Clear all
                            </Button>
                        )}
                    </Group>

                    {space.groupsAccess.length > 0 && (
                        <GroupsAccessList
                            disabled={disabled}
                            isPrivate={space.isPrivate}
                            groupsAccess={space.groupsAccess}
                            onAccessChange={handleGroupAccessChange}
                            pageSize={5}
                        />
                    )}

                    {accessByType.direct.length > 0 && (
                        <UserAccessList
                            isPrivate={space.isPrivate}
                            accessList={accessByType.direct}
                            sessionUser={sessionUser}
                            onAccessChange={handleAccessChange}
                            pageSize={5}
                            disabled={disabled}
                        />
                    )}
                </>
            )}

            {/* Empty state when no permissions at all */}
            {!hasInheritedAccess && !hasDirectAccess && (
                <Text c="ldGray.5" fz="sm" ta="center" py="md">
                    No permissions configured for this space.
                </Text>
            )}
        </Stack>
    );
};
