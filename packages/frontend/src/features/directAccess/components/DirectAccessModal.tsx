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
import { type TFunction } from 'i18next';
import { useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { LightdashUserAvatar } from '../../../components/Avatar';
import Callout from '../../../components/common/Callout';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import {
    getInitials,
    getUserNameOrEmail,
} from '../../../components/common/ShareSpaceModal/Utils';
import useApp from '../../../providers/App/useApp';
import { type DirectAccessResourceRef } from '../api';
import {
    useDirectAccessAssignments,
    useDirectAccessAvailability,
    useDirectAccessGroups,
    useDirectAccessUsers,
    useResetDirectAccess,
    useRevokeDirectAccessAssignment,
    useUpsertDirectAccessAssignment,
} from '../hooks/useDirectAccess';
import classes from './DirectAccessModal.module.css';

const getRoleOptions = (t: TFunction) => [
    { value: SpaceMemberRole.VIEWER, label: t('directAccess.roles.viewer') },
    { value: SpaceMemberRole.EDITOR, label: t('directAccess.roles.editor') },
    { value: SpaceMemberRole.ADMIN, label: t('directAccess.roles.admin') },
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
    const { t } = useTranslation('app');
    const { principal, role } = assignment;
    const isUser = principal.type === DirectAccessPrincipalType.USER;

    return (
        <Group gap="sm" justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap" miw={0} flex={1}>
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
                <Stack gap={0} miw={0} flex={1}>
                    <Text fw={600} fz="sm" truncate>
                        {isUser ? userDisplayName(principal) : principal.name}
                        {isSelf ? (
                            <Text fw={400} fz="sm" span c="dimmed">
                                {' '}
                                {t('directAccess.you')}
                            </Text>
                        ) : null}
                    </Text>
                    {isUser && principal.email ? (
                        <Text fz="xs" c="dimmed" truncate>
                            {principal.email}
                        </Text>
                    ) : (
                        <Text fz="xs" c="dimmed">
                            {isUser
                                ? t('directAccess.user')
                                : t('directAccess.group')}
                        </Text>
                    )}
                </Stack>
            </Group>

            <Group gap="xs" wrap="nowrap" flex="0 0 auto">
                <Select
                    size="xs"
                    w={120}
                    aria-label={t('directAccess.roleFor', {
                        name: isUser
                            ? userDisplayName(principal)
                            : principal.name,
                    })}
                    data={getRoleOptions(t)}
                    value={role}
                    disabled={isMutating}
                    allowDeselect={false}
                    onChange={(value) => {
                        if (value && value !== role) {
                            onRoleChange(value as SpaceMemberRole);
                        }
                    }}
                />
                <Tooltip label={t('directAccess.removeAccess')}>
                    <ActionIcon
                        color="red"
                        aria-label={t('directAccess.removeAccessFor', {
                            name: isUser
                                ? userDisplayName(principal)
                                : principal.name,
                        })}
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
    resource: DirectAccessResourceRef;
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
    resource,
    assignedKeys,
    isMutating,
    onAdd,
}) => {
    const { t } = useTranslation('app');
    const [selectedPrincipal, setSelectedPrincipal] = useState<string | null>(
        null,
    );
    const [selectedRole, setSelectedRole] = useState<SpaceMemberRole>(
        SpaceMemberRole.VIEWER,
    );
    const users = useDirectAccessUsers(projectUuid, resource);
    const groups = useDirectAccessGroups(projectUuid, resource);

    const options = useMemo(() => {
        const userOptions = (users.data ?? [])
            .map((user) => ({
                value: `${DirectAccessPrincipalType.USER}:${user.userUuid}`,
                label: userDisplayName(user),
            }))
            .filter((option) => !assignedKeys.has(option.value));
        const groupOptions = (groups.data ?? [])
            .map((group) => ({
                value: `${DirectAccessPrincipalType.GROUP}:${group.groupUuid}`,
                label: group.name,
            }))
            .filter((option) => !assignedKeys.has(option.value));
        return [
            { group: t('directAccess.users'), items: userOptions },
            { group: t('directAccess.groups'), items: groupOptions },
        ].filter((section) => section.items.length > 0);
    }, [users.data, groups.data, assignedKeys, t]);

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
                miw={0}
                size="xs"
                label={t('directAccess.shareWith')}
                autoFocus
                placeholder={t('directAccess.shareWithPlaceholder')}
                searchable
                clearable
                aria-label={t('directAccess.shareWithAria')}
                nothingFoundMessage={t('directAccess.noMatches')}
                error={
                    users.isError || groups.isError
                        ? t('directAccess.loadPrincipalsError')
                        : undefined
                }
                data={options}
                value={selectedPrincipal}
                disabled={isMutating}
                onChange={setSelectedPrincipal}
            />
            <Select
                size="xs"
                w={120}
                flex="0 0 auto"
                aria-label={t('directAccess.roleForNew')}
                data={getRoleOptions(t)}
                value={selectedRole}
                allowDeselect={false}
                onChange={(value) => {
                    if (value) setSelectedRole(value as SpaceMemberRole);
                }}
            />
            <Button
                size="xs"
                flex="0 0 auto"
                disabled={!selectedPrincipal || isMutating}
                onClick={handleAdd}
            >
                {t('directAccess.share')}
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
    const { t } = useTranslation('app');
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
    const canManageAssignments =
        availability.isAvailable &&
        !assignmentsQuery.isInitialLoading &&
        !assignmentsQuery.isError;
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
                opened={
                    opened && (confirmation === null || !canManageAssignments)
                }
                onClose={onClose}
                title={t('directAccess.title', { name: resource.name })}
                icon={IconUsers}
                size="lg"
                leftActions={
                    canManageAssignments && assignments.length > 0 ? (
                        <Button
                            variant="subtle"
                            color="red"
                            size="xs"
                            disabled={isMutating}
                            onClick={() => setConfirmation({ kind: 'reset' })}
                        >
                            {t('directAccess.removeAll')}
                        </Button>
                    ) : undefined
                }
                actions={
                    <Button variant="default" onClick={onClose}>
                        {t('directAccess.done')}
                    </Button>
                }
            >
                <Stack gap="md" className={classes.content}>
                    {resource.resourceType ===
                        DirectAccessResourceType.DASHBOARD && (
                        <Text fz="sm" c="dimmed">
                            {t('directAccess.dashboardRolesHint')}
                        </Text>
                    )}
                    {isUnavailable ? (
                        <Callout
                            variant="info"
                            title={t('directAccess.unavailableTitle')}
                        >
                            <Text fz="sm">
                                {t('directAccess.unavailableDescription')}
                            </Text>
                        </Callout>
                    ) : null}
                    {canManageAssignments && (
                        <AddDirectAccess
                            projectUuid={projectUuid}
                            resource={ref}
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
                    )}

                    {assignmentsQuery.isInitialLoading ? (
                        <Center py="lg">
                            <Loader size="sm" />
                        </Center>
                    ) : assignmentsQuery.isError ? (
                        <Callout
                            variant="danger"
                            title={t('directAccess.loadError')}
                        >
                            <Stack gap="xs" align="flex-start">
                                <Text fz="sm">
                                    {assignmentsQuery.error.error?.message ??
                                        t('errorBoundary.somethingWentWrong')}
                                </Text>
                                <Button
                                    size="xs"
                                    variant="default"
                                    autoFocus
                                    onClick={() => {
                                        setConfirmation(null);
                                        void assignmentsQuery.refetch();
                                    }}
                                >
                                    {t('actions.retry', { ns: 'common' })}
                                </Button>
                            </Stack>
                        </Callout>
                    ) : !canManageAssignments ? null : assignments.length ===
                      0 ? (
                        <Text fz="sm" c="dimmed" ta="center" py="md">
                            {resource.resourceType ===
                            DirectAccessResourceType.APP
                                ? t('directAccess.notShared')
                                : t('directAccess.notSharedSpace')}
                        </Text>
                    ) : (
                        <Stack
                            gap="sm"
                            role="list"
                            aria-label={t('directAccess.listLabel')}
                        >
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
                opened={opened && confirmation !== null && canManageAssignments}
                onClose={() => setConfirmation(null)}
                variant="delete"
                size="sm"
                title={
                    confirmation?.kind === 'reset'
                        ? t('directAccess.removeAll')
                        : t('directAccess.removeOwn')
                }
                description={
                    confirmation?.kind === 'reset'
                        ? t('directAccess.removeAllDescription', {
                              name: resource.name,
                          })
                        : t('directAccess.removeOwnDescription', {
                              name: resource.name,
                          })
                }
                confirmLabel={t('actions.remove', { ns: 'common' })}
                onConfirm={handleConfirm}
            />
        </>
    );
};

export default DirectAccessModal;
