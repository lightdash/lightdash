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
    IconUsers,
    type Icon as TablerIconType,
} from '@tabler/icons-react';
import { forwardRef, useCallback, useMemo, type FC } from 'react';
import useToaster from '../../../hooks/toaster/useToaster';
import {
    useAddGroupSpaceShareMutation,
    useAddSpaceShareMutation,
    useDeleteSpaceGroupAccessMutation,
    useDeleteSpaceShareMutation,
} from '../../../hooks/useSpaces';
import MantineIcon from '../MantineIcon';
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
                bg={hovered || isOpen ? theme.colors.gray[0] : undefined}
                sx={{ cursor: 'pointer' }}
                onClick={toggle}
            >
                <Group spacing="xs">
                    <Avatar size={'sm'} radius="xl" color="gray">
                        <MantineIcon icon={icon} size={'sm'} radius="xl" />
                    </Avatar>
                    <Text fw={600} fz="sm">
                        {label}{' '}
                        <Text fw={400} span c="gray.6">
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
};
const UserAccessList: FC<UserAccessListProps> = ({
    isPrivate,
    accessList,
    sessionUser,
    onAccessChange,
}) => {
    return (
        <Stack spacing="sm">
            {accessList
                .sort(sortByRole(sessionUser?.userUuid))
                .map((sharedUser) => {
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
                        accessType.value === UserAccessAction.DELETE &&
                        !isPrivate
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
                                        <Text fw={400} span c="gray.6">
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
                                    color="gray.6"
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
                                    disabled={
                                        !needsToBePromotedToInteractiveViewer
                                    }
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
                                        error={
                                            needsToBePromotedToInteractiveViewer
                                        }
                                        rightSection={
                                            needsToBePromotedToInteractiveViewer ? (
                                                <MantineIcon
                                                    icon={IconAlertCircle}
                                                    size="sm"
                                                    color="red.6"
                                                />
                                            ) : null
                                        }
                                    />
                                </Tooltip>
                            )}
                        </Group>
                    );
                })}
        </Stack>
    );
};

type GroupAccessListProps = {
    isPrivate: boolean;
    groupsAccess: SpaceGroup[];
    onAccessChange: (
        action: UserAccessAction,
        currentGroupAccess: SpaceGroup,
    ) => void;
};
const GroupsAccessList: FC<GroupAccessListProps> = ({
    isPrivate,
    onAccessChange,
    groupsAccess,
}) => {
    return (
        <Stack spacing="sm">
            {groupsAccess.map((group) => {
                const userAccessTypes = UserAccessOptions.map((accessType) =>
                    accessType.value === UserAccessAction.DELETE
                        ? {
                              ...accessType,
                              title: { isPrivate }
                                  ? 'Remove access'
                                  : 'Reset access',
                              selectDescription: { isPrivate }
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
                        />
                    </Group>
                );
            })}
        </Stack>
    );
};

type SpaceAccessByType = {
    project: SpaceShare[];
    organisation: SpaceShare[];
    direct: SpaceShare[];
};

export const ShareSpaceUserList: FC<ShareSpaceUserListProps> = ({
    space,
    projectUuid,
    sessionUser,
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
        return space.access.reduce<SpaceAccessByType>(
            (acc, spaceShare) => {
                if (spaceShare.hasDirectAccess) {
                    acc.direct.push(spaceShare);
                } else if (spaceShare.inheritedFrom === 'project') {
                    acc.project.push(spaceShare);
                } else {
                    acc.organisation.push(spaceShare);
                }
                return acc;
            },
            {
                project: [],
                organisation: [],
                direct: [],
            },
        );
    }, [space]);

    return (
        <Stack spacing={'xs'}>
            {(accessByType.organisation.length > 0 ||
                accessByType.project.length > 0) && (
                <Text fw={400} span c="gray.6">
                    Inherited access
                </Text>
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
                    />
                </ListCollapse>
            )}
            {space.access.length > 0 && (
                <>
                    <Text fw={400} span c="gray.6">
                        Group access
                    </Text>
                    <GroupsAccessList
                        isPrivate={space.isPrivate}
                        groupsAccess={space.groupsAccess}
                        onAccessChange={handleGroupAccessChange}
                    />
                </>
            )}
            {accessByType.direct.length > 0 && (
                <>
                    <Text fw={400} span c="gray.6">
                        User access
                    </Text>
                    <UserAccessList
                        isPrivate={space.isPrivate}
                        accessList={accessByType.direct}
                        sessionUser={sessionUser}
                        onAccessChange={handleAccessChange}
                    />
                </>
            )}
        </Stack>
    );
};
