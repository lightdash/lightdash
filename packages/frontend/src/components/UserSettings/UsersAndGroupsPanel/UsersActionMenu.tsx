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
} from '@mantine-8/core';
import {
    IconAlertCircle,
    IconChevronDown,
    IconChevronUp,
    IconDots,
    IconInfoCircle,
    IconMail,
    IconTrash,
} from '@tabler/icons-react';
import React, { useCallback, useEffect, type FC } from 'react';
import useHealth from '../../../hooks/health/useHealth';
import type { useCreateInviteLinkMutation } from '../../../hooks/useInviteLink';
import {
    useDeleteOrganizationUserMutation,
    useReassignUserSchedulersMutation,
    useUserSchedulersSummary,
} from '../../../hooks/useOrganizationUsers';
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
                <Text fz="xs" c="ldGray.6">
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

const UsersActionMenu: FC<UsersActionMenuProps> = ({
    user,
    disabled,
    canInvite,
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

    const { mutateAsync: deleteUser, isLoading: isDeleting } =
        useDeleteOrganizationUserMutation();
    const { mutateAsync: reassignSchedulers, isLoading: isReassigning } =
        useReassignUserSchedulersMutation();
    const { data: schedulersSummary, isLoading: isLoadingSchedulers } =
        useUserSchedulersSummary(user.userUuid, isDeleteDialogOpen);
    const { track } = useTracking();
    const health = useHealth();

    const hasSchedulers = schedulersSummary && schedulersSummary.totalCount > 0;
    const isProcessing = isDeleting || isReassigning;

    // Reset state when modal opens/closes
    useEffect(() => {
        if (isDeleteDialogOpen) {
            setSchedulerAction(SchedulerAction.REASSIGN);
            setSelectedNewOwner(null);
            setIsProjectBreakdownOpen(false);
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
        await deleteUser(user.userUuid);
        setIsDeleteDialogOpen(false);
    }, [
        hasSchedulers,
        schedulerAction,
        selectedNewOwner,
        reassignSchedulers,
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

    const canConfirmDelete =
        !hasSchedulers ||
        schedulerAction === SchedulerAction.DELETE ||
        (schedulerAction === SchedulerAction.REASSIGN && selectedNewOwner);

    const schedulerText =
        schedulersSummary?.totalCount === 1
            ? '1 scheduled delivery'
            : `${schedulersSummary?.totalCount} scheduled deliveries`;

    const projectCount = schedulersSummary?.byProject.length ?? 0;
    const projectText =
        projectCount === 1 ? '1 project' : `${projectCount} projects`;

    const handleSchedulerActionChange = useCallback((value: string) => {
        if (
            value !== SchedulerAction.DELETE &&
            value !== SchedulerAction.REASSIGN
        )
            return;
        setSchedulerAction(value);
    }, []);

    return (
        <>
            <Menu
                withinPortal
                position="bottom-start"
                withArrow
                arrowPosition="center"
                shadow="md"
                offset={-4}
                closeOnItemClick
                closeOnClickOutside
            >
                <Menu.Target>
                    <ActionIcon variant="subtle" disabled={disabled}>
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
                </Menu.Dropdown>
            </Menu>

            <MantineModal
                opened={isDeleteDialogOpen}
                onClose={() =>
                    !isDeleting ? setIsDeleteDialogOpen(false) : undefined
                }
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

                    <Card withBorder>
                        <UserNameDisplay user={user} />
                    </Card>

                    {isLoadingSchedulers ? (
                        <Text fz="sm" c="dimmed">
                            Checking scheduled deliveries...
                        </Text>
                    ) : hasSchedulers ? (
                        <>
                            <Alert
                                color="orange"
                                icon={<MantineIcon icon={IconAlertCircle} />}
                            >
                                <Stack gap="xs">
                                    <Text fz="sm">
                                        This user owns {schedulerText} across{' '}
                                        {projectText}.
                                    </Text>
                                    <PolymorphicGroupButton
                                        gap="xxs"
                                        onClick={() =>
                                            setIsProjectBreakdownOpen(
                                                (prev) => !prev,
                                            )
                                        }
                                    >
                                        <Text fz="xs" c="orange.7" fw={500}>
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
                                    <Collapse in={isProjectBreakdownOpen}>
                                        <Stack gap="xxs">
                                            {schedulersSummary?.byProject.map(
                                                (project) => (
                                                    <Text
                                                        key={
                                                            project.projectUuid
                                                        }
                                                        fz="xs"
                                                    >
                                                        • {project.projectName}:{' '}
                                                        {project.count}{' '}
                                                        {project.count === 1
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

                            {schedulerAction === SchedulerAction.REASSIGN && (
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
                                                color="ldGray.6"
                                                size="lg"
                                            />
                                            <Text fz="xs" c="dimmed">
                                                You can only transfer ownership
                                                of a Google Sheets sync to a
                                                user with an active Google
                                                connection.
                                            </Text>
                                        </Group>
                                    )}
                                </Stack>
                            )}
                        </>
                    ) : (
                        <Group gap="xs">
                            <MantineIcon
                                icon={IconAlertCircle}
                                color="ldGray.6"
                            />
                            <Text fz="xs" c="dimmed" span>
                                This user has no scheduled deliveries.
                            </Text>
                        </Group>
                    )}
                </Stack>
            </MantineModal>
        </>
    );
};

export default UsersActionMenu;
