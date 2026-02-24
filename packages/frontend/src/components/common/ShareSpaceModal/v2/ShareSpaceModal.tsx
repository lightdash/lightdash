import {
    ProjectMemberRole,
    SpaceMemberRole,
    type SpaceGroup,
    type SpaceShare,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Avatar,
    Badge,
    Box,
    Button,
    Group,
    Stack,
    Tabs,
    Text,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import {
    IconFolderShare,
    IconLock,
    IconLockOpen,
    IconSearch,
    IconSettings,
    IconSortAZ,
    IconUsers,
} from '@tabler/icons-react';
import chunk from 'lodash/chunk';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { useNavigate } from 'react-router';
import useToaster from '../../../../hooks/toaster/useToaster';
import useSearchParams from '../../../../hooks/useSearchParams';
import {
    useAddGroupSpaceShareMutation,
    useAddSpaceShareMutation,
    useDeleteSpaceGroupAccessMutation,
    useDeleteSpaceShareMutation,
} from '../../../../hooks/useSpaces';
import useApp from '../../../../providers/App/useApp';

import Callout from '../../Callout';
import MantineIcon from '../../MantineIcon';
import MantineModal from '../../MantineModal';
import PaginateControl from '../../PaginateControl';
import { DEFAULT_PAGE_SIZE } from '../../Table/constants';
import type { ShareSpaceProps } from '../index';
import { ShareSpaceAddUser } from '../ShareSpaceAddUser';
import { UserAccessAction, UserAccessOptions } from '../ShareSpaceSelect';
import { getInitials, getUserNameOrEmail } from '../Utils';
import classes from './ShareSpaceModal.module.css';
import {
    AccessModelToggle,
    GroupsAccessList,
    UserAccessList,
} from './ShareSpaceModalShared';
import {
    getAccessColor,
    sortAccessList,
    useSpaceAccessByType,
    type SortOrder,
} from './ShareSpaceModalUtils';

type AuditUser = SpaceShare & {
    origin: string;
};

const getOriginInfo = (
    share: SpaceShare,
    bucket: 'direct' | 'parentSpace' | 'project' | 'organization',
): Pick<AuditUser, 'origin'> => {
    if (bucket === 'direct') {
        if (share.inheritedFrom === 'space_group') {
            return { origin: 'Group' };
        }
        return { origin: 'Direct' };
    }
    if (bucket === 'parentSpace') {
        return { origin: 'Parent' };
    }
    if (bucket === 'project') {
        return { origin: 'Project' };
    }
    return { origin: 'Organization' };
};

type UserAccessAuditListProps = {
    users: AuditUser[];
    sessionUserUuid: string | undefined;
    pageSize?: number;
};

const UserAccessAuditList: FC<UserAccessAuditListProps> = ({
    users,
    sessionUserUuid,
    pageSize,
}) => {
    const [page, setPage] = useState(1);

    const paginatedList = useMemo(
        () => chunk(users, pageSize ?? DEFAULT_PAGE_SIZE),
        [users, pageSize],
    );

    const handleNextPage = useCallback(() => {
        if (page < paginatedList.length) setPage((p) => p + 1);
    }, [page, paginatedList.length]);

    const handlePreviousPage = useCallback(() => {
        if (page > 1) setPage((p) => p - 1);
    }, [page]);

    useEffect(() => {
        setPage(1);
    }, [users.length]);

    return (
        <Stack gap="sm">
            {paginatedList[page - 1]?.map((user) => {
                const isSessionUser = user.userUuid === sessionUserUuid;
                const [roleColor, roleShade] = getAccessColor(user.role);

                return (
                    <Group
                        key={user.userUuid}
                        gap="sm"
                        justify="space-between"
                        wrap="nowrap"
                        className={classes.auditRow}
                    >
                        <Group gap="sm" wrap="nowrap">
                            <Avatar
                                size="sm"
                                radius="xl"
                                tt="uppercase"
                                color="blue"
                            >
                                {getInitials(
                                    user.userUuid,
                                    user.firstName,
                                    user.lastName,
                                    user.email,
                                )}
                            </Avatar>
                            <Text fw={600} fz="sm" truncate>
                                {getUserNameOrEmail(
                                    user.userUuid,
                                    user.firstName,
                                    user.lastName,
                                    user.email,
                                )}
                                {isSessionUser ? (
                                    <Text fw={400} span c="ldGray.6">
                                        {' '}
                                        (you)
                                    </Text>
                                ) : null}
                            </Text>
                        </Group>

                        <Badge
                            size="sm"
                            variant="light"
                            color={`${roleColor}.${roleShade}`}
                            radius="xl"
                        >
                            {user.origin} &middot;{' '}
                            {UserAccessOptions.find(
                                (o) => o.value === user.role,
                            )?.title ?? user.role}
                        </Badge>
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

const ShareSpaceModalV2A: FC<ShareSpaceProps> = ({ space, projectUuid }) => {
    const navigate = useNavigate();
    const shareSpaceModalSearchParam = useSearchParams('shareSpaceModal');
    const { user: sessionUser } = useApp();
    const { showToastError } = useToaster();

    const [isOpen, setIsOpen] = useState(false);
    const [sortOrder, setSortOrder] = useState<SortOrder>('name');
    const [auditSortOrder, setAuditSortOrder] = useState<SortOrder>('name');
    const [auditSearch, setAuditSearch] = useState('');

    const isNestedSpace = !!space.parentSpaceUuid;

    useEffect(() => {
        if (shareSpaceModalSearchParam === 'true') {
            setIsOpen(true);
            void navigate(`/projects/${projectUuid}/spaces/${space.uuid}`);
        }
    }, [navigate, projectUuid, shareSpaceModalSearchParam, space.uuid]);

    const { mutate: unshareSpaceMutation } = useDeleteSpaceShareMutation(
        projectUuid,
        space.uuid,
    );
    const { mutate: shareSpaceMutation } = useAddSpaceShareMutation(
        projectUuid,
        space.uuid,
    );
    const { mutate: unshareGroupMutation } = useDeleteSpaceGroupAccessMutation(
        projectUuid,
        space.uuid,
    );
    const { mutate: shareGroupMutation } = useAddGroupSpaceShareMutation(
        projectUuid,
        space.uuid,
    );

    const handleAccessChange = useCallback(
        (action: UserAccessAction, sharedUser: SpaceShare) => {
            if (action === UserAccessAction.DELETE) {
                unshareSpaceMutation(sharedUser.userUuid);
            } else {
                if (
                    sharedUser.inheritedRole === ProjectMemberRole.ADMIN &&
                    action !== UserAccessAction.ADMIN
                ) {
                    showToastError({
                        title: 'Failed to update user access',
                        subtitle: `An admin can not be a space ${action}`,
                    });
                    return;
                }
                shareSpaceMutation([
                    sharedUser.userUuid,
                    action || SpaceMemberRole.VIEWER,
                ]);
            }
        },
        [unshareSpaceMutation, shareSpaceMutation, showToastError],
    );

    const handleGroupAccessChange = useCallback(
        (action: UserAccessAction, group: SpaceGroup) => {
            if (action === UserAccessAction.DELETE) {
                unshareGroupMutation(group.groupUuid);
            } else {
                if (
                    group.spaceRole === SpaceMemberRole.ADMIN &&
                    action !== UserAccessAction.ADMIN
                ) {
                    showToastError({
                        title: 'Failed to update group access',
                        subtitle: `An admin can not be a space ${action}`,
                    });
                    return;
                }
                shareGroupMutation([
                    group.groupUuid,
                    action || SpaceMemberRole.VIEWER,
                ]);
            }
        },
        [unshareGroupMutation, shareGroupMutation, showToastError],
    );

    const accessByType = useSpaceAccessByType(space);
    const manageCount = accessByType.direct.length + space.groupsAccess.length;

    const auditUsers = useMemo<AuditUser[]>(() => {
        const result: AuditUser[] = [];

        for (const user of accessByType.direct) {
            result.push({ ...user, ...getOriginInfo(user, 'direct') });
        }
        for (const user of accessByType.parentSpace) {
            result.push({
                ...user,
                ...getOriginInfo(user, 'parentSpace'),
            });
        }
        for (const user of accessByType.project) {
            result.push({ ...user, ...getOriginInfo(user, 'project') });
        }
        for (const user of accessByType.organization) {
            result.push({
                ...user,
                ...getOriginInfo(user, 'organization'),
            });
        }

        return result;
    }, [accessByType]);

    const filteredAuditUsers = useMemo(() => {
        let list = auditUsers;
        if (auditSearch) {
            const lower = auditSearch.toLowerCase();
            list = list.filter((u) => {
                const name =
                    getUserNameOrEmail(
                        u.userUuid,
                        u.firstName,
                        u.lastName,
                        u.email,
                    ) ?? '';
                return name.toLowerCase().includes(lower);
            });
        }
        return structuredClone(list).sort(
            sortAccessList(sessionUser.data?.userUuid, auditSortOrder),
        );
    }, [auditUsers, auditSearch, auditSortOrder, sessionUser.data?.userUuid]);

    return (
        <>
            <Box>
                <Button
                    leftSection={
                        !space.inheritParentPermissions ? (
                            <IconLock size={18} />
                        ) : (
                            <IconUsers size={18} />
                        )
                    }
                    onClick={() => setIsOpen(true)}
                    variant="default"
                >
                    Share
                </Button>
            </Box>

            <MantineModal
                size="xl"
                icon={IconFolderShare}
                title={`Share "${space.name}" space`}
                opened={isOpen}
                onClose={() => setIsOpen(false)}
                cancelLabel={false}
                actions={
                    <Box>
                        <Text c="ldGray.7" fz="xs">
                            Learn more about permissions in our{' '}
                            <Anchor
                                href="https://docs.lightdash.com/references/roles"
                                target="_blank"
                                rel="noreferrer"
                                fz="xs"
                            >
                                docs
                            </Anchor>
                            .
                        </Text>
                    </Box>
                }
                modalActionsProps={{
                    bg: 'ldGray.0',
                }}
            >
                <Stack gap="md">
                    <AccessModelToggle
                        space={space}
                        projectUuid={projectUuid}
                        isNestedSpace={isNestedSpace}
                    />

                    <Tabs
                        keepMounted={false}
                        defaultValue="manage"
                        onChange={() => setAuditSearch('')}
                    >
                        <Tabs.List>
                            <Tabs.Tab
                                value="manage"
                                leftSection={
                                    <MantineIcon icon={IconUsers} size="sm" />
                                }
                            >
                                Shared with ({manageCount})
                            </Tabs.Tab>
                            <Tabs.Tab
                                value="audit"
                                leftSection={
                                    <MantineIcon
                                        icon={IconSettings}
                                        size="sm"
                                    />
                                }
                            >
                                Who has access ({auditUsers.length})
                            </Tabs.Tab>
                        </Tabs.List>

                        <Tabs.Panel value="manage" pt="md">
                            <Stack gap="md">
                                <ShareSpaceAddUser
                                    space={space}
                                    projectUuid={projectUuid}
                                />

                                {accessByType.direct.length >= 5 &&
                                    space.groupsAccess.length === 0 && (
                                        <Callout
                                            variant="info"
                                            title="Tip: Use groups for easier management"
                                        >
                                            <Text fz="sm">
                                                This space is shared with
                                                several individual users.
                                                Consider using{' '}
                                                <Anchor
                                                    href="/generalSettings/userManagement"
                                                    target="_blank"
                                                    fz="sm"
                                                >
                                                    groups
                                                </Anchor>{' '}
                                                to manage access more
                                                efficiently.
                                            </Text>
                                        </Callout>
                                    )}

                                {space.groupsAccess.length > 0 && (
                                    <Stack gap="xs">
                                        <Text fw={400} c="ldGray.6" fz="sm">
                                            Groups
                                        </Text>
                                        <GroupsAccessList
                                            isPrivate={
                                                !space.inheritParentPermissions
                                            }
                                            groupsAccess={space.groupsAccess}
                                            onAccessChange={
                                                handleGroupAccessChange
                                            }
                                            pageSize={5}
                                        />
                                    </Stack>
                                )}

                                {accessByType.direct.length > 0 && (
                                    <Stack gap="xs">
                                        <Group
                                            gap={6}
                                            wrap="nowrap"
                                            mt={
                                                space.groupsAccess.length > 0
                                                    ? 'sm'
                                                    : undefined
                                            }
                                        >
                                            <Text fw={400} c="ldGray.6" fz="sm">
                                                Users
                                            </Text>
                                            <Tooltip
                                                label={
                                                    sortOrder === 'name'
                                                        ? 'Sort by access level'
                                                        : 'Sort by name'
                                                }
                                                position="top"
                                                withArrow
                                                withinPortal
                                            >
                                                <ActionIcon
                                                    size="lg"
                                                    variant="subtle"
                                                    onClick={() =>
                                                        setSortOrder((prev) =>
                                                            prev === 'name'
                                                                ? 'role'
                                                                : 'name',
                                                        )
                                                    }
                                                >
                                                    <MantineIcon
                                                        icon={
                                                            sortOrder === 'name'
                                                                ? IconSortAZ
                                                                : IconLockOpen
                                                        }
                                                        size="md"
                                                        color="ldGray.5"
                                                    />
                                                </ActionIcon>
                                            </Tooltip>
                                        </Group>
                                        <UserAccessList
                                            isPrivate={
                                                !space.inheritParentPermissions
                                            }
                                            accessList={accessByType.direct}
                                            sessionUser={sessionUser.data}
                                            onAccessChange={handleAccessChange}
                                            pageSize={5}
                                            sortOrder={sortOrder}
                                        />
                                    </Stack>
                                )}

                                {manageCount === 0 && (
                                    <Stack gap="xs" align="center" py="md">
                                        <MantineIcon
                                            icon={IconUsers}
                                            size="xl"
                                            color="ldGray.4"
                                        />
                                        <Text c="ldGray.5" fz="sm" ta="center">
                                            This space hasn't been shared with
                                            any users or groups.
                                        </Text>
                                    </Stack>
                                )}
                            </Stack>
                        </Tabs.Panel>

                        <Tabs.Panel value="audit" pt="md">
                            <Stack gap="sm">
                                <Group gap="xs" wrap="nowrap">
                                    <TextInput
                                        placeholder="Search users..."
                                        leftSection={
                                            <MantineIcon
                                                icon={IconSearch}
                                                size="sm"
                                            />
                                        }
                                        size="sm"
                                        value={auditSearch}
                                        onChange={(e) =>
                                            setAuditSearch(
                                                e.currentTarget.value,
                                            )
                                        }
                                        flex={1}
                                    />
                                    <Tooltip
                                        label={
                                            auditSortOrder === 'name'
                                                ? 'Sort by access level'
                                                : 'Sort by name'
                                        }
                                        position="top"
                                        withArrow
                                        withinPortal
                                    >
                                        <ActionIcon
                                            size="lg"
                                            variant="subtle"
                                            onClick={() =>
                                                setAuditSortOrder((prev) =>
                                                    prev === 'name'
                                                        ? 'role'
                                                        : 'name',
                                                )
                                            }
                                        >
                                            <MantineIcon
                                                icon={
                                                    auditSortOrder === 'name'
                                                        ? IconSortAZ
                                                        : IconLockOpen
                                                }
                                                size="md"
                                                color="ldGray.5"
                                            />
                                        </ActionIcon>
                                    </Tooltip>
                                </Group>
                                {filteredAuditUsers.length > 0 ? (
                                    <UserAccessAuditList
                                        users={filteredAuditUsers}
                                        sessionUserUuid={
                                            sessionUser.data?.userUuid
                                        }
                                        pageSize={10}
                                    />
                                ) : (
                                    <Text
                                        c="ldGray.5"
                                        fz="sm"
                                        ta="center"
                                        py="md"
                                    >
                                        {auditSearch
                                            ? 'No users match your search.'
                                            : "This space hasn't been shared with any users or groups, only admins can access it."}
                                    </Text>
                                )}
                            </Stack>
                        </Tabs.Panel>
                    </Tabs>
                </Stack>
            </MantineModal>
        </>
    );
};

export default ShareSpaceModalV2A;
