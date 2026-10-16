import { getAgentCapabilityName } from '@lightdash/common';
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
} from '@tabler/icons-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import InlineErrorState from '../../components/common/InlineErrorState';
import MantineIcon from '../../components/common/MantineIcon';
import { useAgentConnections, useAgentConnectionStatus } from './api';
import { ConnectionTimestamp } from './ConnectionTimestamp';
import { RevokeAgentConnectionModal } from './RevokeAgentConnectionModal';
import {
    type AgentConnectionRecord,
    type AgentConnectionStatus,
} from './types';

const restrictionReasons = new Map([
    ['person_permission', 'personPermission'],
    ['agent_policy', 'agentPolicy'],
    ['project_access', 'projectAccess'],
    ['not_supported', 'notSupported'],
    ['agent_identity_disabled', 'agentIdentityDisabled'],
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
    const { t } = useTranslation('aiAccess');
    const descriptionId = useId();
    const reason = t(
        `agentConnections.table.reasons.${
            restrictionReasons.get(action.reason ?? '') ?? 'unavailable'
        }`,
    );
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
                    aria-label={t('agentConnections.table.whyNameLimited', {
                        name,
                    })}
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
    const { t } = useTranslation('aiAccess');
    const approvedCapabilities = new Set(approved?.approvedCapabilities);
    const restricted = project.capabilities.filter(
        (action) =>
            !action.allowed && approvedCapabilities.has(action.capability),
    );
    if (!restricted.length) return null;
    return (
        <Stack gap="xs">
            <Text fw={500}>
                {approved?.name ??
                    t('agentConnections.table.projectUnavailable')}
            </Text>
            {restricted.map((action) => (
                <RestrictedAction key={action.capability} action={action} />
            ))}
            {restricted.some((action) =>
                restorableReasons.has(action.reason ?? ''),
            ) && (
                <Text size="xs" c="dimmed">
                    {t('agentConnections.table.mayReturn')}
                </Text>
            )}
        </Stack>
    );
};

const ConnectionRestrictions = ({
    status,
    connection,
}: {
    status: ReturnType<typeof useAgentConnectionStatus>;
    connection: AgentConnectionRecord;
}) => {
    const { t } = useTranslation('aiAccess');
    if (status.isError)
        return (
            <InlineErrorState
                message={status.error.error.message}
                onRetry={() => void status.refetch()}
            />
        );
    if (status.isInitialLoading)
        return (
            <EmptyStateLoader
                title={t('agentConnections.table.checkingRestrictions')}
            />
        );
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
    const { t } = useTranslation('aiAccess');
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
                            label={
                                expanded
                                    ? t('agentConnections.table.hideDetails')
                                    : t('agentConnections.table.showDetails')
                            }
                            events={{ hover: true, focus: true, touch: false }}
                        >
                            <ActionIcon
                                variant="subtle"
                                aria-label={
                                    expanded
                                        ? t('agentConnections.table.collapse', {
                                              name: connection.name,
                                          })
                                        : t('agentConnections.table.expand', {
                                              name: connection.name,
                                          })
                                }
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
                                {t('agentConnections.table.summary', {
                                    projects: t(
                                        'agentConnections.table.projectCount',
                                        {
                                            count: connection.approvedProjects
                                                .length,
                                        },
                                    ),
                                    actions: t(
                                        'agentConnections.table.actionCount',
                                        { count: actions.length },
                                    ),
                                })}
                            </Text>
                        </Stack>
                    </Group>
                </Table.Td>
                <Table.Td>
                    <Text size="sm">
                        <ConnectionTimestamp value={connection.expiresAt} />
                    </Text>
                </Table.Td>
                <Table.Td>
                    <Text
                        size="sm"
                        c={connection.lastUsedAt ? undefined : 'dimmed'}
                    >
                        {connection.lastUsedAt ? (
                            <ConnectionTimestamp
                                value={connection.lastUsedAt}
                            />
                        ) : (
                            t('agentConnections.table.neverUsed')
                        )}
                    </Text>
                </Table.Td>
                <Table.Td>
                    <Badge variant="light" color={active ? 'green' : 'gray'}>
                        {connection.limitsStatus === 'invalid'
                            ? t('agentConnections.table.status.invalid')
                            : t(
                                  `agentConnections.table.status.${connection.status}`,
                              )}
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
                            {t('agentConnections.revoke.confirm')}
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
                                            t(
                                                'agentConnections.table.projectUnavailable',
                                            )}
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
                                {t('agentConnections.table.approved')}{' '}
                                <ConnectionTimestamp
                                    value={connection.approvedAt}
                                />
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
    const { t } = useTranslation('aiAccess');
    const query = useAgentConnections({
        refetchOnMount: false,
        retryOnMount: false,
    });
    if (query.isError)
        return (
            <InlineErrorState
                message={query.error.error.message}
                onRetry={() => void query.refetch()}
            />
        );
    if (!query.data)
        return <EmptyStateLoader title={t('agentConnections.table.loading')} />;
    return (
        <Table.ScrollContainer minWidth={600}>
            <Table>
                <Table.Thead>
                    <Table.Tr>
                        {['connection', 'expires', 'lastUsed', 'status'].map(
                            (heading) => (
                                <Table.Th key={heading}>
                                    {t(
                                        `agentConnections.table.headings.${heading}`,
                                    )}
                                </Table.Th>
                            ),
                        )}
                        <Table.Th />
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
