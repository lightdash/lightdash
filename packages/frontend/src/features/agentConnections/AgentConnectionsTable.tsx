import {
    formatTimestamp,
    TimeFrames,
    getAgentCapabilityName,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Button,
    Group,
    Stack,
    Table,
    Text,
    Tooltip,
    VisuallyHidden,
} from '@mantine/core';
import {
    IconInfoCircle,
    IconChevronDown,
    IconChevronRight,
    IconPlugConnected,
} from '@tabler/icons-react';
import { useId, useState } from 'react';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import InlineErrorState from '../../components/common/InlineErrorState';
import MantineIcon from '../../components/common/MantineIcon';
import { SettingsEmptyState } from '../../components/common/Settings/SettingsEmptyState';
import { useAgentConnections, useAgentConnectionStatus } from './api';
import { RevokeAgentConnectionModal } from './RevokeAgentConnectionModal';
import {
    type AgentConnectionRecord,
    type AgentConnectionStatus,
} from './types';

const statusLabels = {
    active: 'Active',
    expired: 'Expired',
    revoked: 'Revoked',
} as const;
const displayDate = (value: string) =>
    formatTimestamp(value, TimeFrames.MINUTE);
const restrictionReasons = new Map([
    [
        'person_permission',
        'Your permissions in this project do not allow this action.',
    ],
    ['agent_policy', 'This action is turned off for agents.'],
    ['project_access', 'You no longer have access to this project.'],
    ['not_supported', 'This action is not available for connections.'],
    ['agent_identity_disabled', 'Agents are turned off.'],
]);
const restorableReasons = new Set([
    'person_permission',
    'agent_policy',
    'project_access',
]);
type EffectiveProject = AgentConnectionStatus['effectiveProjects'][number];

const RestrictedAction = ({
    action,
}: {
    action: EffectiveProject['capabilities'][number];
}) => {
    const descriptionId = useId();
    const reason =
        restrictionReasons.get(action.reason ?? '') ??
        'Not available right now.';
    const name = getAgentCapabilityName(action.capability);
    return (
        <Group gap="xs">
            <Text size="sm">{name}</Text>
            <Tooltip
                label={reason}
                events={{ hover: true, focus: true, touch: false }}
                multiline
                maw={320}
            >
                <ActionIcon
                    size="xs"
                    aria-label={`Why ${name} is limited`}
                    aria-describedby={descriptionId}
                >
                    <MantineIcon
                        icon={IconInfoCircle}
                        color="dimmed"
                        aria-hidden
                    />
                </ActionIcon>
            </Tooltip>
            <VisuallyHidden id={descriptionId}>{reason}</VisuallyHidden>
        </Group>
    );
};

const ProjectRestrictions = ({
    project,
    approved,
}: {
    project: EffectiveProject;
    approved: AgentConnectionRecord['approvedProjects'][number] | undefined;
}) => {
    const approvedCapabilities = new Set(approved?.approvedCapabilities);
    const restricted = project.capabilities.filter(
        (action) =>
            !action.allowed && approvedCapabilities.has(action.capability),
    );
    if (!restricted.length) return null;
    return (
        <Stack gap="xs">
            <Text fw={500}>
                {approved?.name ?? 'Project no longer available'}
            </Text>
            {restricted.map((action) => (
                <RestrictedAction key={action.capability} action={action} />
            ))}
            {restricted.some((action) =>
                restorableReasons.has(action.reason ?? ''),
            ) && (
                <Text size="xs" c="dimmed">
                    May return if your permissions change.
                </Text>
            )}
        </Stack>
    );
};
const count = (value: number, noun: string) =>
    `${value} ${noun}${value === 1 ? '' : 's'}`;

const ConnectionRestrictions = ({
    status,
    connection,
}: {
    status: ReturnType<typeof useAgentConnectionStatus>;
    connection: AgentConnectionRecord;
}) => {
    if (status.isError)
        return (
            <InlineErrorState
                message={status.error.error.message}
                onRetry={() => void status.refetch()}
            />
        );
    if (status.isInitialLoading)
        return <EmptyStateLoader title="Checking restrictions" />;
    if (!status.data) return null;
    return (
        <Stack gap="sm">
            {status.data.effectiveProjects.map((project) => (
                <ProjectRestrictions
                    key={project.projectUuid}
                    project={project}
                    approved={connection.approvedProjects.find(
                        (item) => item.projectUuid === project.projectUuid,
                    )}
                />
            ))}
        </Stack>
    );
};

const ConnectionRow = ({
    connection,
}: {
    connection: AgentConnectionRecord;
}) => {
    const [expanded, setExpanded] = useState(false);
    const [revoking, setRevoking] = useState(false);
    const active =
        connection.status === 'active' && connection.limitsStatus === 'ok';
    const status = useAgentConnectionStatus(
        connection.grantUuid,
        expanded && active,
    );
    const actions = [
        ...new Set(
            connection.approvedProjects.flatMap(
                (project) => project.approvedCapabilities,
            ),
        ),
    ];
    return (
        <>
            <Table.Tr>
                <Table.Td>
                    <Group gap="xs" wrap="nowrap">
                        <Tooltip
                            label={expanded ? 'Hide details' : 'Show details'}
                            events={{ hover: true, focus: true, touch: false }}
                        >
                            <ActionIcon
                                variant="subtle"
                                aria-label={`${expanded ? 'Collapse' : 'Expand'} ${connection.name}`}
                                aria-expanded={expanded}
                                aria-controls={`restrictions-${connection.grantUuid}`}
                                onClick={() => setExpanded((value) => !value)}
                            >
                                <MantineIcon
                                    icon={
                                        expanded
                                            ? IconChevronDown
                                            : IconChevronRight
                                    }
                                />
                            </ActionIcon>
                        </Tooltip>
                        <Stack gap={0}>
                            <Text fw={500}>{connection.name}</Text>
                            <Text size="xs" c="dimmed">
                                CLI ·{' '}
                                {count(
                                    connection.approvedProjects.length,
                                    'project',
                                )}{' '}
                                · {count(actions.length, 'action')}
                            </Text>
                        </Stack>
                    </Group>
                </Table.Td>
                <Table.Td>
                    <Text size="sm">{displayDate(connection.expiresAt)}</Text>
                </Table.Td>
                <Table.Td>
                    <Text
                        size="sm"
                        c={connection.lastUsedAt ? undefined : 'dimmed'}
                    >
                        {connection.lastUsedAt
                            ? displayDate(connection.lastUsedAt)
                            : 'Never used'}
                    </Text>
                </Table.Td>
                <Table.Td>
                    <Badge variant="light" color={active ? 'green' : 'gray'}>
                        {connection.limitsStatus === 'invalid'
                            ? 'Invalid'
                            : statusLabels[connection.status]}
                    </Badge>
                </Table.Td>
                <Table.Td ta="right">
                    {active && (
                        <Button
                            variant="subtle"
                            color="red"
                            size="compact-sm"
                            onClick={() => setRevoking(true)}
                        >
                            Revoke
                        </Button>
                    )}
                </Table.Td>
            </Table.Tr>
            {expanded && (
                <Table.Tr id={`restrictions-${connection.grantUuid}`}>
                    <Table.Td colSpan={5}>
                        <Stack gap="xs" mb={active ? 'sm' : 0}>
                            {connection.approvedProjects.map((project) => (
                                <Group key={project.projectUuid} gap="xs">
                                    <Text size="sm" fw={500}>
                                        {project.name ??
                                            'Project no longer available'}
                                    </Text>
                                    {project.approvedCapabilities.map(
                                        (capability) => (
                                            <Badge
                                                key={capability}
                                                variant="default"
                                                size="sm"
                                            >
                                                {getAgentCapabilityName(
                                                    capability,
                                                )}
                                            </Badge>
                                        ),
                                    )}
                                </Group>
                            ))}
                            <Text size="xs" c="dimmed">
                                Approved {displayDate(connection.approvedAt)}
                            </Text>
                        </Stack>
                        {active && (
                            <ConnectionRestrictions
                                status={status}
                                connection={connection}
                            />
                        )}
                    </Table.Td>
                </Table.Tr>
            )}
            {revoking && (
                <RevokeAgentConnectionModal
                    connection={connection}
                    onClose={() => setRevoking(false)}
                />
            )}
        </>
    );
};

export const AgentConnectionsTable = () => {
    const query = useAgentConnections();
    if (query.isError)
        return (
            <InlineErrorState
                message={query.error.error.message}
                onRetry={() => void query.refetch()}
            />
        );
    if (!query.data)
        return <EmptyStateLoader title="Loading agent connections" />;
    if (query.data.length === 0)
        return (
            <SettingsEmptyState
                icon={IconPlugConnected}
                title="No agent connections"
                description="Connections will appear here after you approve one."
            />
        );
    return (
        <Table.ScrollContainer minWidth={600}>
            <Table>
                <Table.Thead>
                    <Table.Tr>
                        {[
                            'Connection',
                            'Expires',
                            'Last used',
                            'Status',
                            '',
                        ].map((heading) => (
                            <Table.Th key={heading}>{heading}</Table.Th>
                        ))}
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {query.data.map((connection) => (
                        <ConnectionRow
                            key={connection.grantUuid}
                            connection={connection}
                        />
                    ))}
                </Table.Tbody>
            </Table>
        </Table.ScrollContainer>
    );
};
