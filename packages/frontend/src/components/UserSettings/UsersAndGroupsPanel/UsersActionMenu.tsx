import {
    type OrganizationMemberProfile,
    type OrganizationMemberProfileWithGroups,
} from '@lightdash/common';
import {
    ActionIcon,
    Alert,
    Button,
    Card,
    Collapse,
    Group,
    Menu,
    Radio,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import {
    IconAlertCircle,
    IconChevronDown,
    IconChevronUp,
    IconDots,
    IconEye,
    IconInfoCircle,
    IconLayoutDashboard,
    IconMail,
    IconTrash,
} from '@tabler/icons-react';
import React, { useCallback, useEffect, type FC } from 'react';
import useHealth from '../../../hooks/health/useHealth';
import type { useCreateInviteLinkMutation } from '../../../hooks/useInviteLink';
import {
    useDeleteOrganizationUserMutation,
    useReassignUserDashboardsMutation,
    useReassignUserSchedulersMutation,
    useUserDashboardsSummary,
    useUserSchedulersSummary,
} from '../../../hooks/useOrganizationUsers';
import {
    useImpersonationSettings,
    useStartImpersonation,
} from '../../../hooks/user/useImpersonation';
import useApp from '../../../providers/App/useApp';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import MantineIcon from '../../common/MantineIcon';
import MantineModal from '../../common/MantineModal';
import { PolymorphicGroupButton } from '../../common/PolymorphicGroupButton';
import { UserSelect } from '../../common/UserSelect';

interface UsersActionMenuProps {
    user: OrganizationMemberProfile | OrganizationMemberProfileWithGroups;
    disabled: boolean;
    canInvite: boolean;
    canDelete: boolean;
    inviteLink: ReturnType<typeof useCreateInviteLinkMutation>;
    onInviteSent: (userUuid: string) => void;
}

const UserNameDisplay: FC<{
    user: OrganizationMemberProfile;
}> = ({ user }) => {
    return (
        <Stack gap="xxs" align="flex-start">
            <Title order={6}>
                {user.firstName
                    ? `${user.firstName} ${user.lastName}`
                    : user.email}
            </Title>
            {user.email && user.firstName && (
                <Text fz="xs" c="dimmed">
                    {user.email}
                </Text>
            )}
        </Stack>
    );
};

enum SchedulerAction {
    DELETE = 'delete',
    REASSIGN = 'reassign',
}

enum DashboardOwnerAction {
    LEAVE_UNOWNED = 'leave_unowned',
    REASSIGN = 'reassign',
}

const UsersActionMenu: FC<UsersActionMenuProps> = ({
    user,
    disabled,
    canInvite,
    canDelete,
    inviteLink,
    onInviteSent,
}) => {
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
    const [schedulerAction, setSchedulerAction] =
        React.useState<SchedulerAction>(SchedulerAction.REASSIGN);
    const [selectedNewOwner, setSelectedNewOwner] = React.useState<
        string | null
    >(null);
    const [isProjectBreakdownOpen, setIsProjectBreakdownOpen] =
        React.useState(false);
    const [dashboardOwnerAction, setDashboardOwnerAction] =
        React.useState<DashboardOwnerAction>(DashboardOwnerAction.REASSIGN);
    const [selectedDashboardOwner, setSelectedDashboardOwner] = React.useState<
        string | null
    >(null);
    const [isDashboardBreakdownOpen, setIsDashboardBreakdownOpen] =
        React.useState(false);

    const { user: currentUser } = useApp();
    const { mutate: startImpersonation, isLoading: isStartingImpersonation } =
        useStartImpersonation();
    const { data: impersonationSettings } = useImpersonationSettings();

    const canImpersonate =
        !!impersonationSettings?.impersonationEnabled &&
        !!currentUser.data?.ability?.can('impersonate', 'User') &&
        user.isActive &&
        !user.isPending &&
        currentUser.data?.userUuid !== user.userUuid;

    const { mutateAsync: deleteUser, isLoading: isDeleting } =
        useDeleteOrganizationUserMutation();
    const { mutateAsync: reassignSchedulers, isLoading: isReassigning } =
        useReassignUserSchedulersMutation();
    const { data: schedulersSummary, isLoading: isLoadingSchedulers } =
        useUserSchedulersSummary(user.userUuid, isDeleteDialogOpen);
    const {
        mutateAsync: reassignDashboards,
        isLoading: isReassigningDashboards,
    } = useReassignUserDashboardsMutation();
    const { data: dashboardsSummary, isLoading: isLoadingDashboards } =
        useUserDashboardsSummary(user.userUuid, isDeleteDialogOpen);
    const { track } = useTracking();
    const health = useHealth();

    const hasSchedulers = schedulersSummary && schedulersSummary.totalCount > 0;
    const hasOwnedDashboards =
        dashboardsSummary && dashboardsSummary.totalCount > 0;
    const isProcessing = isDeleting || isReassigning || isReassigningDashboards;

    // Reset state when modal opens/closes
    useEffect(() => {
        if (isDeleteDialogOpen) {
            setSchedulerAction(SchedulerAction.REASSIGN);
            setSelectedNewOwner(null);
            setIsProjectBreakdownOpen(false);
            setDashboardOwnerAction(DashboardOwnerAction.REASSIGN);
            setSelectedDashboardOwner(null);
            setIsDashboardBreakdownOpen(false);
        }
    }, [isDeleteDialogOpen]);

    const handleDelete = useCallback(async () => {
        if (hasSchedulers && schedulerAction === SchedulerAction.REASSIGN) {
            if (!selectedNewOwner) return;
            await reassignSchedulers({
                userUuid: user.userUuid,
                newOwnerUserUuid: selectedNewOwner,
            });
        }
        if (
            hasOwnedDashboards &&
            dashboardOwnerAction === DashboardOwnerAction.REASSIGN
        ) {
            if (!selectedDashboardOwner) return;
            await reassignDashboards({
                userUuid: user.userUuid,
                newOwnerUserUuid: selectedDashboardOwner,
            });
        }
        await deleteUser(user.userUuid);
        setIsDeleteDialogOpen(false);
    }, [
        hasSchedulers,
        schedulerAction,
        selectedNewOwner,
        reassignSchedulers,
        hasOwnedDashboards,
        dashboardOwnerAction,
        selectedDashboardOwner,
        reassignDashboards,
        deleteUser,
        user.userUuid,
    ]);

    const getNewLink = () => {
        track({
            name: EventName.INVITE_BUTTON_CLICKED,
        });
        inviteLink.mutate(
            { email: user.email, role: user.role },
            {
                onSuccess: () => {
                    onInviteSent(user.userUuid);
                },
            },
        );
    };

    const showResendInvite = canInvite && user.isPending;

    const canConfirmSchedulers =
        !hasSchedulers ||
        schedulerAction === SchedulerAction.DELETE ||
        (schedulerAction === SchedulerAction.REASSIGN && selectedNewOwner);

    const canConfirmDashboards =
        !hasOwnedDashboards ||
        dashboardOwnerAction === DashboardOwnerAction.LEAVE_UNOWNED ||
        (dashboardOwnerAction === DashboardOwnerAction.REASSIGN &&
            selectedDashboardOwner);

    const canConfirmDelete = canConfirmSchedulers && canConfirmDashboards;

    const schedulerText =
        schedulersSummary?.totalCount === 1
            ? '1 scheduled delivery'
            : `${schedulersSummary?.totalCount} scheduled deliveries`;

    const projectCount = schedulersSummary?.byProject.length ?? 0;
    const projectText =
        projectCount === 1 ? '1 project' : `${projectCount} projects`;

    const dashboardText =
        dashboardsSummary?.totalCount === 1
            ? '1 dashboard'
            : `${dashboardsSummary?.totalCount} dashboards`;

    const dashboardProjectCount = dashboardsSummary?.byProject.length ?? 0;
    const dashboardProjectText =
        dashboardProjectCount === 1
            ? '1 project'
            : `${dashboardProjectCount} projects`;

    const handleSchedulerActionChange = useCallback((value: string) => {
        if (
            value !== SchedulerAction.DELETE &&
            value !== SchedulerAction.REASSIGN
        )
            return;
        setSchedulerAction(value);
    }, []);

    const handleDashboardOwnerActionChange = useCallback((value: string) => {
        if (
            value !== DashboardOwnerAction.LEAVE_UNOWNED &&
            value !== DashboardOwnerAction.REASSIGN
        )
            return;
        setDashboardOwnerAction(value);
    }, []);

    if (!showResendInvite && !canImpersonate && !canDelete) {
        return null;
    }

    return (
        <>
            <Menu
                position="bottom-start"
                withArrow
                arrowPosition="center"
                offset={-4}
                closeOnItemClick
                closeOnClickOutside
            >
                <Menu.Target>
                    <ActionIcon disabled={disabled}>
                        <MantineIcon icon={IconDots} />
                    </ActionIcon>
                </Menu.Target>

                <Menu.Dropdown maw={320}>
                    {showResendInvite && (
                        <>
                            <Menu.Item
                                component="button"
                                role="menuitem"
                                leftSection={<MantineIcon icon={IconMail} />}
                                onClick={getNewLink}
                            >
                                {health.data?.hasEmailClient
                                    ? 'Send new invite'
                                    : 'Get new link'}
                            </Menu.Item>
                            <Menu.Divider />
                        </>
                    )}
                    {canImpersonate && (
                        <>
                            <Menu.Item
                                component="button"
                                role="menuitem"
                                leftSection={<MantineIcon icon={IconEye} />}
                                onClick={() =>
                                    startImpersonation(user.userUuid)
                                }
                                disabled={isStartingImpersonation}
                            >
                                Impersonate user
                            </Menu.Item>
                            <Menu.Divider />
                        </>
                    )}
                    {canDelete && (
                        <Menu.Item
                            component="button"
                            role="menuitem"
                            color="red"
                            leftSection={<MantineIcon icon={IconTrash} />}
                            onClick={() => setIsDeleteDialogOpen(true)}
                            disabled={disabled}
                        >
                            Delete user
                        </Menu.Item>
                    )}
                </Menu.Dropdown>
            </Menu>

            <MantineModal
                opened={isDeleteDialogOpen}
                onClose={() =>
                    !isDeleting ? setIsDeleteDialogOpen(false) : undefined
                }
                role="alertdialog"
                title="Delete user"
                icon={IconTrash}
                cancelDisabled={isDeleting}
                actions={
                    <Button
                        onClick={handleDelete}
                        loading={isProcessing}
                        disabled={!canConfirmDelete}
                        color="red"
                    >
                        Delete
                    </Button>
                }
            >
                <Stack gap="md">
                    <Text>Are you sure you want to delete this user?</Text>

                    <Card>
                        <UserNameDisplay user={user} />
                    </Card>

                    {isLoadingSchedulers || isLoadingDashboards ? (
                        <Text fz="sm" c="dimmed">
                            Checking content owned by this user...
                        </Text>
                    ) : hasSchedulers || hasOwnedDashboards ? (
                        <>
                            {hasSchedulers ? (
                                <>
                                    <Alert
                                        color="orange"
                                        icon={
                                            <MantineIcon
                                                icon={IconAlertCircle}
                                            />
                                        }
                                    >
                                        <Stack gap="xs">
                                            <Text fz="sm">
                                                This user owns {schedulerText}{' '}
                                                across {projectText}.
                                            </Text>
                                            <PolymorphicGroupButton
                                                gap="xxs"
                                                onClick={() =>
                                                    setIsProjectBreakdownOpen(
                                                        (prev) => !prev,
                                                    )
                                                }
                                            >
                                                <Text
                                                    fz="xs"
                                                    c="orange.7"
                                                    fw={500}
                                                >
                                                    {isProjectBreakdownOpen
                                                        ? 'Hide details'
                                                        : 'Show details'}
                                                </Text>
                                                <MantineIcon
                                                    icon={
                                                        isProjectBreakdownOpen
                                                            ? IconChevronUp
                                                            : IconChevronDown
                                                    }
                                                    color="orange.7"
                                                    size={14}
                                                />
                                            </PolymorphicGroupButton>
                                            <Collapse
                                                in={isProjectBreakdownOpen}
                                            >
                                                <Stack gap="xxs">
                                                    {schedulersSummary?.byProject.map(
                                                        (project) => (
                                                            <Text
                                                                key={
                                                                    project.projectUuid
                                                                }
                                                                fz="xs"
                                                            >
                                                                •{' '}
                                                                {
                                                                    project.projectName
                                                                }
                                                                :{' '}
                                                                {project.count}{' '}
                                                                {project.count ===
                                                                1
                                                                    ? 'delivery'
                                                                    : 'deliveries'}
                                                            </Text>
                                                        ),
                                                    )}
                                                </Stack>
                                            </Collapse>
                                        </Stack>
                                    </Alert>

                                    {/* this radio group doesn't re-render when the action changes, so we need to use a key to force a re-render */}
                                    <Radio.Group
                                        key={schedulerAction}
                                        name="schedulerAction"
                                        value={schedulerAction}
                                        onChange={handleSchedulerActionChange}
                                    >
                                        <Stack gap="sm">
                                            <Radio
                                                value={SchedulerAction.DELETE}
                                                label="Delete all scheduled deliveries"
                                            />
                                            <Radio
                                                value={SchedulerAction.REASSIGN}
                                                label="Reassign to another user"
                                            />
                                        </Stack>
                                    </Radio.Group>

                                    {schedulerAction ===
                                        SchedulerAction.REASSIGN && (
                                        <Stack gap="xs">
                                            <UserSelect
                                                label="New owner"
                                                value={selectedNewOwner}
                                                onChange={setSelectedNewOwner}
                                                excludedUserUuid={user.userUuid}
                                                requireGoogleToken={
                                                    schedulersSummary?.hasGsheetsSchedulers
                                                }
                                            />
                                            {schedulersSummary?.hasGsheetsSchedulers && (
                                                <Group gap="xs" wrap="nowrap">
                                                    <MantineIcon
                                                        icon={IconInfoCircle}
                                                        color="dimmed"
                                                        size="lg"
                                                    />
                                                    <Text fz="xs" c="dimmed">
                                                        You can only transfer
                                                        ownership of a Google
                                                        Sheets sync to a user
                                                        with an active Google
                                                        connection.
                                                    </Text>
                                                </Group>
                                            )}
                                        </Stack>
                                    )}
                                </>
                            ) : null}

                            {hasOwnedDashboards ? (
                                <>
                                    <Alert
                                        color="orange"
                                        icon={
                                            <MantineIcon
                                                icon={IconLayoutDashboard}
                                            />
                                        }
                                    >
                                        <Stack gap="xs">
                                            <Text fz="sm">
                                                This user is the owner of{' '}
                                                {dashboardText} across{' '}
                                                {dashboardProjectText}.
                                            </Text>
                                            <PolymorphicGroupButton
                                                gap="xxs"
                                                onClick={() =>
                                                    setIsDashboardBreakdownOpen(
                                                        (prev) => !prev,
                                                    )
                                                }
                                            >
                                                <Text
                                                    fz="xs"
                                                    c="orange.7"
                                                    fw={500}
                                                >
                                                    {isDashboardBreakdownOpen
                                                        ? 'Hide details'
                                                        : 'Show details'}
                                                </Text>
                                                <MantineIcon
                                                    icon={
                                                        isDashboardBreakdownOpen
                                                            ? IconChevronUp
                                                            : IconChevronDown
                                                    }
                                                    color="orange.7"
                                                    size={14}
                                                />
                                            </PolymorphicGroupButton>
                                            <Collapse
                                                in={isDashboardBreakdownOpen}
                                            >
                                                <Stack gap="xxs">
                                                    {dashboardsSummary?.byProject.map(
                                                        (project) => (
                                                            <Text
                                                                key={
                                                                    project.projectUuid
                                                                }
                                                                fz="xs"
                                                            >
                                                                •{' '}
                                                                {
                                                                    project.projectName
                                                                }
                                                                :{' '}
                                                                {project.count}{' '}
                                                                {project.count ===
                                                                1
                                                                    ? 'dashboard'
                                                                    : 'dashboards'}
                                                            </Text>
                                                        ),
                                                    )}
                                                </Stack>
                                            </Collapse>
                                        </Stack>
                                    </Alert>

                                    {/* keyed like the scheduler radio group to force a re-render on change */}
                                    <Radio.Group
                                        key={dashboardOwnerAction}
                                        name="dashboardOwnerAction"
                                        value={dashboardOwnerAction}
                                        onChange={
                                            handleDashboardOwnerActionChange
                                        }
                                    >
                                        <Stack gap="sm">
                                            <Radio
                                                value={
                                                    DashboardOwnerAction.LEAVE_UNOWNED
                                                }
                                                label="Leave dashboards without an owner"
                                            />
                                            <Radio
                                                value={
                                                    DashboardOwnerAction.REASSIGN
                                                }
                                                label="Transfer ownership to another user"
                                            />
                                        </Stack>
                                    </Radio.Group>

                                    {dashboardOwnerAction ===
                                        DashboardOwnerAction.REASSIGN && (
                                        <UserSelect
                                            label="New dashboard owner"
                                            value={selectedDashboardOwner}
                                            onChange={setSelectedDashboardOwner}
                                            excludedUserUuid={user.userUuid}
                                        />
                                    )}
                                </>
                            ) : null}
                        </>
                    ) : (
                        <Group gap="xs">
                            <MantineIcon
                                icon={IconAlertCircle}
                                color="dimmed"
                            />
                            <Text fz="xs" c="dimmed" span>
                                This user has no scheduled deliveries or
                                dashboards.
                            </Text>
                        </Group>
                    )}
                </Stack>
            </MantineModal>
        </>
    );
};

export default UsersActionMenu;
