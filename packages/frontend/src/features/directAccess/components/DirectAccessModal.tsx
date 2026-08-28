import {
    DirectAccessPrincipalType,
    DirectAccessResourceType,
    SpaceMemberRole,
    type DirectAccessAssignment,
    type DirectAccessPrincipal,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Center,
    Group,
    Loader,
    Select,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconTrash, IconUsers } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { LightdashUserAvatar } from '../../../components/Avatar';
import Callout from '../../../components/common/Callout';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import {
    getInitials,
    getUserNameOrEmail,
} from '../../../components/common/ShareSpaceModal/Utils';
import { useOrganizationGroups } from '../../../hooks/useOrganizationGroups';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import useApp from '../../../providers/App/useApp';
import { useProjectGroupAccessList } from '../../projectGroupAccess/hooks/useProjectGroupAccess';
import { type DirectAccessResourceRef } from '../api';
import {
    useDirectAccessAssignments,
    useDirectAccessAvailability,
    useResetDirectAccess,
    useRevokeDirectAccessAssignment,
    useUpsertDirectAccessAssignment,
} from '../hooks/useDirectAccess';

const ROLE_OPTIONS = [
    { value: SpaceMemberRole.VIEWER, label: 'Can view' },
    { value: SpaceMemberRole.EDITOR, label: 'Can edit' },
    { value: SpaceMemberRole.ADMIN, label: 'Full access' },
];

const userDisplayName = (principal: {
    userUuid: string;
    firstName: string;
    lastName: string;
    email: string | null;
}) =>
    getUserNameOrEmail(
        principal.userUuid,
        principal.firstName,
        principal.lastName,
        principal.email ?? undefined,
        false,
    );

const principalKey = (principal: DirectAccessPrincipal) =>
    principal.type === DirectAccessPrincipalType.USER
        ? `${DirectAccessPrincipalType.USER}:${principal.userUuid}`
        : `${DirectAccessPrincipalType.GROUP}:${principal.groupUuid}`;

const principalUuid = (principal: DirectAccessPrincipal) =>
    principal.type === DirectAccessPrincipalType.USER
        ? principal.userUuid
        : principal.groupUuid;

type AssignmentRowProps = {
    assignment: DirectAccessAssignment;
    isSelf: boolean;
    isMutating: boolean;
    onRoleChange: (role: SpaceMemberRole) => void;
    onRevoke: () => void;
};

const AssignmentRow: FC<AssignmentRowProps> = ({
    assignment,
    isSelf,
    isMutating,
    onRoleChange,
    onRevoke,
}) => {
    const { principal, role } = assignment;
    const isUser = principal.type === DirectAccessPrincipalType.USER;

    return (
        <Group gap="sm" justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap" miw={0}>
                {isUser ? (
                    <LightdashUserAvatar
                        size="sm"
                        tt="uppercase"
                        userUuid={principal.userUuid}
                    >
                        {getInitials(
                            principal.userUuid,
                            principal.firstName,
                            principal.lastName,
                            principal.email ?? undefined,
                            false,
                        )}
                    </LightdashUserAvatar>
                ) : (
                    <LightdashUserAvatar size="sm">
                        <MantineIcon icon={IconUsers} />
                    </LightdashUserAvatar>
                )}
                <Stack gap={0} miw={0}>
                    <Text fw={600} fz="sm" truncate>
                        {isUser ? userDisplayName(principal) : principal.name}
                        {isSelf ? (
                            <Text fw={400} fz="sm" span c="ldGray.6">
                                {' '}
                                (you)
                            </Text>
                        ) : null}
                    </Text>
                    {isUser && principal.email ? (
                        <Text fz="xs" c="ldGray.6" truncate>
                            {principal.email}
                        </Text>
                    ) : (
                        <Text fz="xs" c="ldGray.6">
                            {isUser ? 'User' : 'Group'}
                        </Text>
                    )}
                </Stack>
            </Group>

            <Group gap="xs" wrap="nowrap">
                <Select
                    size="xs"
                    w={120}
                    aria-label={`Role for ${
                        isUser ? userDisplayName(principal) : principal.name
                    }`}
                    data={ROLE_OPTIONS}
                    value={role}
                    disabled={isMutating}
                    allowDeselect={false}
                    onChange={(value) => {
                        if (value && value !== role) {
                            onRoleChange(value as SpaceMemberRole);
                        }
                    }}
                />
                <Tooltip label="Remove access" withArrow>
                    <ActionIcon
                        variant="subtle"
                        color="red"
                        aria-label={`Remove access for ${
                            isUser ? userDisplayName(principal) : principal.name
                        }`}
                        disabled={isMutating}
                        onClick={onRevoke}
                    >
                        <MantineIcon icon={IconTrash} />
                    </ActionIcon>
                </Tooltip>
            </Group>
        </Group>
    );
};

type AddDirectAccessProps = {
    projectUuid: string;
    assignedKeys: Set<string>;
    isMutating: boolean;
    onAdd: (
        principalType: DirectAccessPrincipalType,
        uuid: string,
        role: SpaceMemberRole,
    ) => void;
};

const AddDirectAccess: FC<AddDirectAccessProps> = ({
    projectUuid,
    assignedKeys,
    isMutating,
    onAdd,
}) => {
    const [selectedPrincipal, setSelectedPrincipal] = useState<string | null>(
        null,
    );
    const [selectedRole, setSelectedRole] = useState<SpaceMemberRole>(
        SpaceMemberRole.VIEWER,
    );
    const organizationUsers = useOrganizationUsers({ projectUuid });
    const groupAccess = useProjectGroupAccessList(projectUuid);
    const organizationGroups = useOrganizationGroups({});

    const options = useMemo(() => {
        const groupNamesByUuid = new Map(
            (organizationGroups.data ?? []).map((group) => [
                group.uuid,
                group.name,
            ]),
        );
        const userOptions = (organizationUsers.data ?? [])
            .map((member) => ({
                value: `${DirectAccessPrincipalType.USER}:${member.userUuid}`,
                label:
                    getUserNameOrEmail(
                        member.userUuid,
                        member.firstName,
                        member.lastName,
                        member.email,
                        false,
                    ) ?? member.email,
            }))
            .filter((option) => !assignedKeys.has(option.value));
        const groupOptions = (groupAccess.data ?? [])
            .map((access) => ({
                value: `${DirectAccessPrincipalType.GROUP}:${access.groupUuid}`,
                label: groupNamesByUuid.get(access.groupUuid) ?? 'Group',
            }))
            .filter((option) => !assignedKeys.has(option.value));
        return [
            { group: 'Users', items: userOptions },
            { group: 'Groups', items: groupOptions },
        ].filter((section) => section.items.length > 0);
    }, [
        organizationUsers.data,
        groupAccess.data,
        organizationGroups.data,
        assignedKeys,
    ]);

    const handleAdd = () => {
        if (!selectedPrincipal) return;
        const [type, uuid] = selectedPrincipal.split(':');
        onAdd(type as DirectAccessPrincipalType, uuid, selectedRole);
        setSelectedPrincipal(null);
    };

    return (
        <Group gap="xs" wrap="nowrap" align="flex-end">
            <Select
                flex={1}
                size="xs"
                label="Share with"
                placeholder="Select users or groups to share with"
                searchable
                clearable
                aria-label="Select a user or group to share with"
                nothingFoundMessage="No matching users or groups"
                data={options}
                value={selectedPrincipal}
                disabled={isMutating}
                onChange={setSelectedPrincipal}
            />
            <Select
                size="xs"
                w={120}
                aria-label="Role for new assignment"
                data={ROLE_OPTIONS}
                value={selectedRole}
                allowDeselect={false}
                onChange={(value) => {
                    if (value) setSelectedRole(value as SpaceMemberRole);
                }}
            />
            <Button
                size="xs"
                disabled={!selectedPrincipal || isMutating}
                onClick={handleAdd}
            >
                Share
            </Button>
        </Group>
    );
};

export type DirectAccessModalProps = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    resource: DirectAccessResourceRef & { name: string };
};

type PendingConfirmation =
    | { kind: 'reset' }
    | { kind: 'self-revoke'; assignment: DirectAccessAssignment };

const DirectAccessModal: FC<DirectAccessModalProps> = ({
    opened,
    onClose,
    projectUuid,
    resource,
}) => {
    const { user } = useApp();
    const sessionUserUuid = user.data?.userUuid;
    const ref = useMemo(
        () => ({
            resourceType: resource.resourceType,
            resourceUuid: resource.resourceUuid,
        }),
        [resource.resourceType, resource.resourceUuid],
    );
    const [confirmation, setConfirmation] =
        useState<PendingConfirmation | null>(null);

    const availability = useDirectAccessAvailability();
    const isUnavailable = !availability.isLoading && !availability.isAvailable;
    const assignmentsQuery = useDirectAccessAssignments(projectUuid, ref, {
        enabled: opened && availability.isAvailable,
    });
    const upsertMutation = useUpsertDirectAccessAssignment(projectUuid, ref);
    const revokeMutation = useRevokeDirectAccessAssignment(projectUuid, ref);
    const resetMutation = useResetDirectAccess(projectUuid, ref);
    const isMutating =
        upsertMutation.isLoading ||
        revokeMutation.isLoading ||
        resetMutation.isLoading;

    const assignments = useMemo(
        () => assignmentsQuery.data ?? [],
        [assignmentsQuery.data],
    );
    const assignedKeys = useMemo(
        () =>
            new Set(
                assignments.map((assignment) =>
                    principalKey(assignment.principal),
                ),
            ),
        [assignments],
    );

    const revokeAssignment = (assignment: DirectAccessAssignment) => {
        revokeMutation.mutate({
            principalType: assignment.principal.type,
            principalUuid: principalUuid(assignment.principal),
        });
    };

    const handleRevoke = (assignment: DirectAccessAssignment) => {
        const isSelf =
            assignment.principal.type === DirectAccessPrincipalType.USER &&
            assignment.principal.userUuid === sessionUserUuid;
        if (isSelf) {
            setConfirmation({ kind: 'self-revoke', assignment });
        } else {
            revokeAssignment(assignment);
        }
    };

    const handleConfirm = () => {
        if (!confirmation) return;
        if (confirmation.kind === 'reset') {
            resetMutation.mutate();
        } else {
            revokeAssignment(confirmation.assignment);
        }
        setConfirmation(null);
    };

    return (
        <>
            <MantineModal
                opened={opened && confirmation === null}
                onClose={onClose}
                title={`Share "${resource.name}"`}
                icon={IconUsers}
                size="lg"
                leftActions={
                    assignments.length > 0 ? (
                        <Button
                            variant="subtle"
                            color="red"
                            size="xs"
                            disabled={isMutating}
                            onClick={() => setConfirmation({ kind: 'reset' })}
                        >
                            Remove all access
                        </Button>
                    ) : undefined
                }
                actions={
                    <Button variant="default" onClick={onClose}>
                        Done
                    </Button>
                }
            >
                <Stack gap="md">
                    {isUnavailable ? (
                        <Callout variant="info" title="Sharing isn't available">
                            <Text fz="sm">
                                Content sharing isn't enabled for this
                                organization.
                            </Text>
                        </Callout>
                    ) : null}
                    <AddDirectAccess
                        projectUuid={projectUuid}
                        assignedKeys={assignedKeys}
                        isMutating={isMutating}
                        onAdd={(principalType, uuid, role) =>
                            upsertMutation.mutate({
                                principalType,
                                principalUuid: uuid,
                                role,
                            })
                        }
                    />

                    {assignmentsQuery.isInitialLoading ? (
                        <Center py="lg">
                            <Loader size="sm" />
                        </Center>
                    ) : assignmentsQuery.isError ? (
                        <Callout variant="danger" title="Could not load access">
                            <Stack gap="xs" align="flex-start">
                                <Text fz="sm">
                                    {assignmentsQuery.error.error?.message ??
                                        'Something went wrong.'}
                                </Text>
                                <Button
                                    size="xs"
                                    variant="default"
                                    onClick={() =>
                                        void assignmentsQuery.refetch()
                                    }
                                >
                                    Retry
                                </Button>
                            </Stack>
                        </Callout>
                    ) : assignments.length === 0 ? (
                        <Text fz="sm" c="ldGray.6" ta="center" py="md">
                            {resource.resourceType ===
                            DirectAccessResourceType.APP
                                ? 'Not shared with anyone yet.'
                                : 'Not shared with anyone yet. People with access to the space can still see it.'}
                        </Text>
                    ) : (
                        <Stack gap="sm" role="list" aria-label="Direct access">
                            {assignments.map((assignment) => (
                                <AssignmentRow
                                    key={principalKey(assignment.principal)}
                                    assignment={assignment}
                                    isSelf={
                                        assignment.principal.type ===
                                            DirectAccessPrincipalType.USER &&
                                        assignment.principal.userUuid ===
                                            sessionUserUuid
                                    }
                                    isMutating={isMutating}
                                    onRoleChange={(role) =>
                                        upsertMutation.mutate({
                                            principalType:
                                                assignment.principal.type,
                                            principalUuid: principalUuid(
                                                assignment.principal,
                                            ),
                                            role,
                                        })
                                    }
                                    onRevoke={() => handleRevoke(assignment)}
                                />
                            ))}
                        </Stack>
                    )}
                </Stack>
            </MantineModal>

            <MantineModal
                opened={confirmation !== null}
                onClose={() => setConfirmation(null)}
                variant="delete"
                size="sm"
                title={
                    confirmation?.kind === 'reset'
                        ? 'Remove all access'
                        : 'Remove your own access'
                }
                description={
                    confirmation?.kind === 'reset'
                        ? `This removes everyone "${resource.name}" was shared with. People will keep any access they have through spaces.`
                        : `You may lose access to "${resource.name}" once it is no longer shared with you.`
                }
                confirmLabel="Remove"
                onConfirm={handleConfirm}
            />
        </>
    );
};

export default DirectAccessModal;
