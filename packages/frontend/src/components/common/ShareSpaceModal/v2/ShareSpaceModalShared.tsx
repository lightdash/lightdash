import {
    ProjectMemberRole,
    SpaceMemberRole,
    type LightdashUser,
    type Space,
    type SpaceGroup,
    type SpaceShare,
} from '@lightdash/common';
import {
    Avatar,
    Badge,
    Group,
    Paper,
    SegmentedControl,
    Select,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import {
    IconAlertCircle,
    IconLock,
    IconUsers,
    IconUsersGroup,
} from '@tabler/icons-react';
import chunk from 'lodash/chunk';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useUpdateMutation } from '../../../../hooks/useSpaces';
import MantineIcon from '../../MantineIcon';
import PaginateControl from '../../PaginateControl';
import { DEFAULT_PAGE_SIZE } from '../../Table/constants';
import { UserAccessAction, UserAccessOptions } from '../ShareSpaceSelect';
import { getInitials, getUserNameOrEmail } from '../Utils';
import classes from './ShareSpaceModalShared.module.css';
import {
    InheritanceType,
    NestedInheritanceOptions,
    RootInheritanceOptions,
    getAccessColor,
    sortAccessList,
    type SortOrder,
} from './ShareSpaceModalUtils';

type UserAccessListProps = {
    isPrivate: boolean;
    accessList: SpaceShare[];
    sessionUser: LightdashUser | undefined;
    onAccessChange: (action: UserAccessAction, user: SpaceShare) => void;
    pageSize?: number;
    disabled?: boolean;
    sortOrder: SortOrder;
};

export const UserAccessList: FC<UserAccessListProps> = ({
    isPrivate,
    accessList,
    sessionUser,
    onAccessChange,
    pageSize,
    disabled = false,
    sortOrder,
}) => {
    const [page, setPage] = useState(1);

    const paginatedList: SpaceShare[][] = useMemo(() => {
        const sorted = structuredClone(accessList).sort(
            sortAccessList(sessionUser?.userUuid, sortOrder),
        );
        return chunk(sorted, pageSize ?? DEFAULT_PAGE_SIZE);
    }, [accessList, pageSize, sessionUser?.userUuid, sortOrder]);

    const handleNextPage = useCallback(() => {
        if (page < paginatedList.length) setPage((p) => p + 1);
    }, [page, paginatedList.length]);

    const handlePreviousPage = useCallback(() => {
        if (page > 1) setPage((p) => p - 1);
    }, [page]);

    return (
        <Stack gap="sm">
            {paginatedList[page - 1]?.map((sharedUser) => {
                const needsPromotion =
                    sharedUser.projectRole === ProjectMemberRole.VIEWER &&
                    sharedUser.role !== SpaceMemberRole.VIEWER;
                const isSessionUser =
                    sharedUser.userUuid === sessionUser?.userUuid;

                const userAccessTypes = UserAccessOptions.filter(
                    (t) =>
                        t.value !== UserAccessAction.DELETE ||
                        sharedUser.hasDirectAccess,
                ).map((t) =>
                    t.value === UserAccessAction.DELETE && !isPrivate
                        ? {
                              ...t,
                              title: 'Reset access',
                              selectDescription: `Reset user's access`,
                          }
                        : t,
                );

                return (
                    <Group
                        key={sharedUser.userUuid}
                        gap="sm"
                        justify="space-between"
                        wrap="nowrap"
                        className={classes.userRow}
                    >
                        <Group>
                            <Avatar
                                size="sm"
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

                        {isSessionUser || !sharedUser.hasDirectAccess ? (
                            <Badge
                                size="xs"
                                color={getAccessColor(sharedUser.role).join(
                                    '.',
                                )}
                                radius="xs"
                                mr="xs"
                            >
                                {UserAccessOptions.find(
                                    (o) => o.value === sharedUser.role,
                                )?.title ?? sharedUser.role}
                            </Badge>
                        ) : (
                            <Tooltip
                                disabled={!needsPromotion}
                                withinPortal
                                label="User needs to be promoted to interactive viewer to have this space access"
                                maw={350}
                                multiline
                            >
                                <Select
                                    classNames={{
                                        input: disabled
                                            ? undefined
                                            : classes.selectInput,
                                    }}
                                    size="xs"
                                    variant={disabled ? 'default' : 'unstyled'}
                                    comboboxProps={{ withinPortal: true }}
                                    data={userAccessTypes.map((u) => ({
                                        label: u.title,
                                        value: u.value,
                                    }))}
                                    value={sharedUser.role}
                                    renderOption={({ option }) => {
                                        const opt = userAccessTypes.find(
                                            (u) => u.value === option.value,
                                        );
                                        return (
                                            <Stack gap={1}>
                                                <Text fz="sm">
                                                    {opt?.title}
                                                </Text>
                                                <Text fz="xs" opacity={0.65}>
                                                    {opt?.selectDescription}
                                                </Text>
                                            </Stack>
                                        );
                                    }}
                                    onChange={(value) => {
                                        if (value) {
                                            onAccessChange(
                                                value as UserAccessAction,
                                                sharedUser,
                                            );
                                        }
                                    }}
                                    error={needsPromotion}
                                    rightSection={
                                        needsPromotion ? (
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
    onAccessChange: (action: UserAccessAction, group: SpaceGroup) => void;
    pageSize?: number;
};

export const GroupsAccessList: FC<GroupAccessListProps> = ({
    disabled = false,
    isPrivate,
    onAccessChange,
    groupsAccess,
    pageSize,
}) => {
    const [page, setPage] = useState(1);

    const paginatedList: SpaceGroup[][] = useMemo(() => {
        return chunk(
            structuredClone(groupsAccess),
            pageSize ?? DEFAULT_PAGE_SIZE,
        );
    }, [groupsAccess, pageSize]);

    const handleNextPage = useCallback(() => {
        if (page < paginatedList.length) setPage((p) => p + 1);
    }, [page, paginatedList.length]);

    const handlePreviousPage = useCallback(() => {
        if (page > 1) setPage((p) => p - 1);
    }, [page]);

    return (
        <Stack gap="sm">
            {paginatedList[page - 1]?.map((group) => {
                const groupAccessTypes = UserAccessOptions.map((t) =>
                    t.value === UserAccessAction.DELETE
                        ? {
                              ...t,
                              title: isPrivate
                                  ? 'Remove access'
                                  : 'Reset access',
                              selectDescription: isPrivate
                                  ? `Remove group's access`
                                  : `Reset group's access`,
                          }
                        : t,
                );

                return (
                    <Group
                        key={group.groupUuid}
                        gap="sm"
                        justify="space-between"
                        wrap="nowrap"
                        className={classes.userRow}
                    >
                        <Group>
                            <Avatar size="sm" radius="xl" color="blue">
                                <MantineIcon icon={IconUsers} size="sm" />
                            </Avatar>
                            <Text fw={600} fz="sm">
                                {group.groupName}
                            </Text>
                        </Group>

                        <Select
                            classNames={{
                                input: disabled
                                    ? undefined
                                    : classes.selectInput,
                            }}
                            size="xs"
                            variant={disabled ? 'default' : 'unstyled'}
                            comboboxProps={{ withinPortal: true }}
                            data={groupAccessTypes.map((u) => ({
                                label: u.title,
                                value: u.value,
                            }))}
                            value={group.spaceRole}
                            renderOption={({ option }) => {
                                const opt = groupAccessTypes.find(
                                    (u) => u.value === option.value,
                                );
                                return (
                                    <Stack gap={1}>
                                        <Text fz="sm">{opt?.title}</Text>
                                        <Text fz="xs" opacity={0.65}>
                                            {opt?.selectDescription}
                                        </Text>
                                    </Stack>
                                );
                            }}
                            onChange={(value) => {
                                if (value) {
                                    onAccessChange(
                                        value as UserAccessAction,
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

type AccessModelToggleProps = {
    space: Space;
    projectUuid: string;
    isNestedSpace: boolean;
};

export const AccessModelToggle: FC<AccessModelToggleProps> = ({
    space,
    projectUuid,
    isNestedSpace,
}) => {
    const { mutate: spaceMutation } = useUpdateMutation(
        projectUuid,
        space.uuid,
    );

    const options = isNestedSpace
        ? NestedInheritanceOptions
        : RootInheritanceOptions;

    const currentValue = space.inheritParentPermissions
        ? InheritanceType.INHERIT
        : InheritanceType.OWN_ONLY;

    const currentOption =
        options.find((o) => o.value === currentValue) ?? options[0];

    return (
        <Paper
            withBorder
            p="md"
            radius="md"
            className={classes.accessModelCard}
        >
            <Group justify="space-between" wrap="nowrap">
                <Group gap="sm" wrap="nowrap">
                    <Avatar
                        radius="xl"
                        color={
                            currentValue === InheritanceType.INHERIT
                                ? 'green'
                                : 'orange'
                        }
                    >
                        <MantineIcon
                            icon={
                                currentValue === InheritanceType.INHERIT
                                    ? IconUsersGroup
                                    : IconLock
                            }
                        />
                    </Avatar>
                    <Stack gap={2}>
                        <Text fw={600} fz="sm">
                            {currentOption.title}
                        </Text>
                        <Text c="ldGray.6" fz="xs">
                            {currentOption.description}
                        </Text>
                    </Stack>
                </Group>

                <SegmentedControl
                    size="xs"
                    radius="md"
                    value={currentValue}
                    classNames={{
                        root: classes.segmentedControl,
                    }}
                    onChange={(value) => {
                        const option = options.find((o) => o.value === value);
                        const inheritParentPermissions =
                            option?.value === InheritanceType.INHERIT;

                        if (
                            option &&
                            inheritParentPermissions !==
                                space.inheritParentPermissions
                        ) {
                            spaceMutation({
                                name: space.name,
                                inheritParentPermissions,
                            });
                        }
                    }}
                    data={options.map((o) => ({
                        value: o.value,
                        label: o.title,
                    }))}
                />
            </Group>
        </Paper>
    );
};
