import {
    ProjectMemberRole,
    SpaceMemberRole,
    type SpaceGroup,
    type SpaceShare,
} from '@lightdash/common';
import {
    Anchor,
    Badge,
    Box,
    Button,
    Collapse,
    Group,
    Stack,
    Tabs,
    Text,
    TextInput,
    UnstyledButton,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    IconChevronDown,
    IconChevronRight,
    IconFolderShare,
    IconLock,
    IconSearch,
    IconSettings,
    IconUsers,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { useNavigate } from 'react-router';
import useToaster from '../../../hooks/toaster/useToaster';
import { useOptionalProjectRoute } from '../../../hooks/useProjectRoute';
import useSearchParams from '../../../hooks/useSearchParams';
import { useSpaceAccess } from '../../../hooks/useSpaceAccess';
import {
    useAddGroupSpaceShareMutation,
    useAddSpaceShareMutation,
    useDeleteSpaceGroupAccessMutation,
    useDeleteSpaceShareMutation,
    useUpdateMutation,
} from '../../../hooks/useSpaces';
import useApp from '../../../providers/App/useApp';
import { LightdashUserAvatar } from '../../Avatar';
import Callout from '../Callout';
import MantineIcon from '../MantineIcon';
import MantineModal from '../MantineModal';
import PaginateControl from '../PaginateControl';
import type { ShareSpaceProps } from './index';
import { ServiceAccountBadge } from './ServiceAccountBadge';
import { ShareSpaceAddUser } from './ShareSpaceAddUser';
import classes from './ShareSpaceModalContent.module.css';
import {
    AccessModelToggle,
    GroupsAccessList,
    UserAccessList,
} from './ShareSpaceModalShared';
import { getAccessColor } from './ShareSpaceModalUtils';
import { UserAccessAction, UserAccessOptions } from './ShareSpaceSelect';
import { getInitials, getUserNameOrEmail } from './Utils';

const MANAGE_PAGE_SIZE = 5;
const AUDIT_PAGE_SIZE = 10;

const getOriginLabel = (share: SpaceShare): string => {
    if (share.inheritedFrom === 'parent_space') return 'Parent';
    if (share.hasDirectAccess) {
        return share.inheritedFrom === 'space_group' ? 'Group' : 'Direct';
    }
    if (share.inheritedFrom === 'space_group') return 'Group';
    if (share.inheritedFrom === 'project' || share.inheritedFrom === 'group') {
        return 'Project';
    }
    if (share.inheritedFrom === 'organization') return 'Organization';
    return 'Direct';
};

type UserAccessAuditListProps = {
    users: SpaceShare[];
    sessionUserUuid: string | undefined;
    page: number;
    totalPages: number;
    onPageChange: (page: number) => void;
};

const UserAccessAuditList: FC<UserAccessAuditListProps> = ({
    users,
    sessionUserUuid,
    page,
    totalPages,
    onPageChange,
}) => {
    const handleNextPage = useCallback(() => {
        if (page < totalPages) onPageChange(page + 1);
    }, [page, totalPages, onPageChange]);

    const handlePreviousPage = useCallback(() => {
        if (page > 1) onPageChange(page - 1);
    }, [page, onPageChange]);

    return (
        <Stack gap="sm">
            {users.map((user) => {
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
                            <LightdashUserAvatar
                                size="sm"
                                tt="uppercase"
                                userUuid={user.userUuid}
                                avatarUrl={user.avatarUrl}
                                avatarGradient={user.avatarGradient}
                            >
                                {getInitials(
                                    user.userUuid,
                                    user.firstName,
                                    user.lastName,
                                    user.email,
                                    user.isInternal,
                                )}
                            </LightdashUserAvatar>
                            <Text fw={600} fz="sm" truncate>
                                {getUserNameOrEmail(
                                    user.userUuid,
                                    user.firstName,
                                    user.lastName,
                                    user.email,
                                    user.isInternal,
                                )}
                                {isSessionUser ? (
                                    <Text fw={400} fz="sm" span c="dimmed">
                                        {' '}
                                        (you)
                                    </Text>
                                ) : null}
                            </Text>
                            {user.isInternal ? <ServiceAccountBadge /> : null}
                        </Group>

                        <Badge
                            size="sm"
                            color={`${roleColor}.${roleShade}`}
                            radius="xl"
                        >
                            {getOriginLabel(user)} &middot;{' '}
                            {UserAccessOptions.find(
                                (o) => o.value === user.role,
                            )?.title ?? user.role}
                        </Badge>
                    </Group>
                );
            })}
            {totalPages > 1 && (
                <PaginateControl
                    currentPage={page}
                    totalPages={totalPages}
                    hasNextPage={page < totalPages}
                    hasPreviousPage={page > 1}
                    onNextPage={handleNextPage}
                    onPreviousPage={handlePreviousPage}
                    style={{ alignSelf: 'flex-end' }}
                />
            )}
        </Stack>
    );
};

const ShareSpaceModalContent: FC<ShareSpaceProps> = ({
    space,
    projectUuid,
    opened: externalOpened,
    onClose: externalOnClose,
}) => {
    const navigate = useNavigate();
    const projectRoute = useOptionalProjectRoute();
    const projectUrlIdentifier =
        projectRoute?.projectUrlIdentifier ?? projectUuid;
    const shareSpaceModalSearchParam = useSearchParams('shareSpaceModal');
    const { user: sessionUser } = useApp();
    const { showToastError } = useToaster();

    const isControlled = externalOpened !== undefined;
    const [internalIsOpen, setInternalIsOpen] = useState(false);
    const isOpen = isControlled ? externalOpened : internalIsOpen;
    const handleClose = isControlled
        ? () => externalOnClose?.()
        : () => setInternalIsOpen(false);
    const [auditSearch, setAuditSearch] = useState('');
    const [debouncedAuditSearch] = useDebouncedValue(auditSearch, 300);
    const [auditPage, setAuditPage] = useState(1);
    const [managePage, setManagePage] = useState(1);
    const [isGroupsHintDismissed, setIsGroupsHintDismissed] = useState(false);
    const [accessDetailsOpen, setAccessDetailsOpen] = useState(false);

    const isNestedSpace = !!space.parentSpaceUuid;

    const {
        data: directAccessPage,
        isPreviousData: isDirectAccessPreviousData,
        isFetching: isDirectAccessFetching,
    } = useSpaceAccess(
        projectUuid,
        space.uuid,
        {
            page: managePage,
            pageSize: MANAGE_PAGE_SIZE,
            directOnly: true,
        },
        { enabled: isOpen },
    );
    const { data: auditAccessPage } = useSpaceAccess(
        projectUuid,
        space.uuid,
        {
            page: auditPage,
            pageSize: AUDIT_PAGE_SIZE,
            searchQuery: debouncedAuditSearch,
        },
        { enabled: isOpen },
    );
    const { data: auditAccessTotals } = useSpaceAccess(
        projectUuid,
        space.uuid,
        { page: 1, pageSize: 1 },
        { enabled: isOpen },
    );

    const directAccessList = directAccessPage?.data ?? [];
    const directTotalResults = directAccessPage?.pagination?.totalResults ?? 0;
    const auditAccessList = auditAccessPage?.data ?? [];
    const auditTotalResults = auditAccessTotals?.pagination?.totalResults ?? 0;
    const manageTotalPages = Math.max(
        directAccessPage?.pagination?.totalPageCount ?? managePage,
        1,
    );
    const effectiveManagePage = Math.min(managePage, manageTotalPages);
    const auditTotalPages = Math.max(
        auditAccessPage?.pagination?.totalPageCount ?? auditPage,
        1,
    );
    const effectiveAuditPage = Math.min(auditPage, auditTotalPages);

    const handleAuditSearchChange = useCallback((value: string) => {
        setAuditSearch(value);
        setAuditPage(1);
    }, []);

    useEffect(() => {
        if (shareSpaceModalSearchParam === 'true') {
            setInternalIsOpen(true);
            void navigate(
                `/projects/${projectUrlIdentifier}/spaces/${space.uuid}`,
            );
        }
    }, [
        navigate,
        projectUrlIdentifier,
        shareSpaceModalSearchParam,
        space.uuid,
    ]);

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
    const { mutateAsync: updateSpaceMutation } = useUpdateMutation(
        projectUuid,
        space.uuid,
    );

    const resetAccessPages = useCallback(() => {
        setManagePage(1);
        setAuditPage(1);
    }, []);

    // Synthetic group entry for "All project members" when the space has it enabled
    const PROJECT_MEMBERS_GROUP_UUID = '__all_project_members__';
    const effectiveGroupsAccess: SpaceGroup[] = useMemo(() => {
        const groups = [...space.groupsAccess];
        if (space.projectMemberAccessRole) {
            groups.unshift({
                groupUuid: PROJECT_MEMBERS_GROUP_UUID,
                groupName: 'All project members',
                spaceRole: space.projectMemberAccessRole,
            });
        }
        return groups;
    }, [space.groupsAccess, space.projectMemberAccessRole]);

    const handleAccessChange = useCallback(
        (action: UserAccessAction, sharedUser: SpaceShare) => {
            if (action === UserAccessAction.DELETE) {
                unshareSpaceMutation(sharedUser.userUuid, {
                    onSettled: resetAccessPages,
                });
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
                shareSpaceMutation(
                    [sharedUser.userUuid, action || SpaceMemberRole.VIEWER],
                    {
                        onSettled: resetAccessPages,
                    },
                );
            }
        },
        [
            unshareSpaceMutation,
            shareSpaceMutation,
            showToastError,
            resetAccessPages,
        ],
    );

    const handleGroupAccessChange = useCallback(
        (action: UserAccessAction, group: SpaceGroup) => {
            // Handle "All project members" synthetic group via space update
            if (group.groupUuid === PROJECT_MEMBERS_GROUP_UUID) {
                if (action === UserAccessAction.DELETE) {
                    void updateSpaceMutation(
                        {
                            name: space.name,
                            projectMemberAccessRole: null,
                        },
                        { onSettled: resetAccessPages },
                    );
                } else {
                    void updateSpaceMutation(
                        {
                            name: space.name,
                            projectMemberAccessRole:
                                (action as unknown as SpaceMemberRole) ||
                                SpaceMemberRole.VIEWER,
                        },
                        { onSettled: resetAccessPages },
                    );
                }
                return;
            }

            if (action === UserAccessAction.DELETE) {
                unshareGroupMutation(group.groupUuid, {
                    onSettled: resetAccessPages,
                });
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
                shareGroupMutation(
                    [group.groupUuid, action || SpaceMemberRole.VIEWER],
                    {
                        onSettled: resetAccessPages,
                    },
                );
            }
        },
        [
            unshareGroupMutation,
            shareGroupMutation,
            showToastError,
            updateSpaceMutation,
            space.name,
            resetAccessPages,
        ],
    );

    const manageCount = directTotalResults + effectiveGroupsAccess.length;

    return (
        <>
            {!isControlled && (
                <Box>
                    <Button
                        leftSection={
                            !space.inheritParentPermissions ? (
                                <IconLock size={18} />
                            ) : (
                                <IconUsers size={18} />
                            )
                        }
                        onClick={() => setInternalIsOpen(true)}
                        variant="default"
                    >
                        Share
                    </Button>
                </Box>
            )}

            <MantineModal
                size="xl"
                icon={IconFolderShare}
                title={`Share "${space.name}" space`}
                opened={isOpen}
                onClose={handleClose}
                cancelLabel={false}
                actions={
                    <Box>
                        <Text c="ldGray.7" fz="xs">
                            Learn more about space permissions in our{' '}
                            <Anchor
                                href="https://docs.lightdash.com/references/workspace/spaces#managing-access-to-a-space"
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

                    <UnstyledButton
                        onClick={() => setAccessDetailsOpen((o) => !o)}
                    >
                        <Group gap="xs">
                            <MantineIcon
                                icon={
                                    accessDetailsOpen
                                        ? IconChevronDown
                                        : IconChevronRight
                                }
                                size="sm"
                                color="ldGray.7"
                            />
                            <Text size="sm" fw={600} c="ldGray.7">
                                Access details
                            </Text>
                        </Group>
                    </UnstyledButton>
                    <Collapse in={accessDetailsOpen}>
                        <Tabs
                            keepMounted={false}
                            defaultValue="manage"
                            onChange={() => handleAuditSearchChange('')}
                        >
                            <Tabs.List>
                                <Tabs.Tab
                                    value="manage"
                                    leftSection={
                                        <MantineIcon
                                            icon={IconUsers}
                                            size="sm"
                                        />
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
                                    Who has access ({auditTotalResults})
                                </Tabs.Tab>
                            </Tabs.List>

                            <Tabs.Panel value="manage" pt="md">
                                <Stack gap="md">
                                    <ShareSpaceAddUser
                                        space={space}
                                        projectUuid={projectUuid}
                                    />

                                    {directTotalResults >= 5 &&
                                        effectiveGroupsAccess.length === 0 &&
                                        !isGroupsHintDismissed && (
                                            <Callout
                                                variant="info"
                                                title="Tip: Use groups for easier management"
                                                withCloseButton
                                                onClose={() =>
                                                    setIsGroupsHintDismissed(
                                                        true,
                                                    )
                                                }
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

                                    {effectiveGroupsAccess.length > 0 && (
                                        <Stack gap="xs">
                                            <Text fw={400} c="dimmed" fz="sm">
                                                Groups
                                            </Text>
                                            <GroupsAccessList
                                                inheritParentPermissions={
                                                    space.inheritParentPermissions
                                                }
                                                groupsAccess={
                                                    effectiveGroupsAccess
                                                }
                                                onAccessChange={
                                                    handleGroupAccessChange
                                                }
                                                pageSize={5}
                                            />
                                        </Stack>
                                    )}

                                    {directTotalResults > 0 && (
                                        <Stack gap="xs">
                                            <Text
                                                fw={400}
                                                c="dimmed"
                                                fz="sm"
                                                mt={
                                                    effectiveGroupsAccess.length >
                                                    0
                                                        ? 'sm'
                                                        : undefined
                                                }
                                            >
                                                Users
                                            </Text>
                                            <UserAccessList
                                                inheritParentPermissions={
                                                    space.inheritParentPermissions
                                                }
                                                accessList={directAccessList}
                                                sessionUser={sessionUser.data}
                                                onAccessChange={
                                                    handleAccessChange
                                                }
                                                disabled={
                                                    isDirectAccessPreviousData ||
                                                    isDirectAccessFetching
                                                }
                                                page={effectiveManagePage}
                                                totalPages={manageTotalPages}
                                                onPageChange={setManagePage}
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
                                            <Text
                                                c="ldGray.5"
                                                fz="sm"
                                                ta="center"
                                            >
                                                This space hasn't been shared
                                                with any users or groups.
                                            </Text>
                                        </Stack>
                                    )}
                                </Stack>
                            </Tabs.Panel>

                            <Tabs.Panel value="audit" pt="md">
                                <Stack gap="sm">
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
                                            handleAuditSearchChange(
                                                e.currentTarget.value,
                                            )
                                        }
                                    />
                                    {auditAccessList.length > 0 ? (
                                        <UserAccessAuditList
                                            users={auditAccessList}
                                            sessionUserUuid={
                                                sessionUser.data?.userUuid
                                            }
                                            page={effectiveAuditPage}
                                            totalPages={auditTotalPages}
                                            onPageChange={setAuditPage}
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
                    </Collapse>
                </Stack>
            </MantineModal>
        </>
    );
};

export default ShareSpaceModalContent;
