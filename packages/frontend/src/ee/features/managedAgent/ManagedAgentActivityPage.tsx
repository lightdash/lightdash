import {
    Box,
    Group,
    Loader,
    Stack,
    Table,
    Text,
    Title,
    Tooltip,
    UnstyledButton,
} from '@mantine-8/core';
import {
    IconChartBar,
    IconExternalLink,
    IconLayoutDashboard,
    IconX,
} from '@tabler/icons-react';
import { type FC, useMemo, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { NAVBAR_HEIGHT } from '../../../components/common/Page/constants';
import TruncatedText from '../../../components/common/TruncatedText';
import { useManagedAgentActions } from './hooks/useManagedAgentActions';
import { useManagedAgentSettings } from './hooks/useManagedAgentSettings';
import classes from './ManagedAgentActivityPage.module.css';
import type { ManagedAgentAction } from './types';

const ACTION_CONFIG: Record<
    ManagedAgentAction['actionType'],
    { label: string; dotColor: string }
> = {
    flagged_stale: {
        label: 'Stale',
        dotColor: 'var(--mantine-color-orange-5)',
    },
    soft_deleted: {
        label: 'Deleted',
        dotColor: 'var(--mantine-color-red-5)',
    },
    flagged_broken: {
        label: 'Broken',
        dotColor: 'var(--mantine-color-red-5)',
    },
    fixed_broken: {
        label: 'Fixed',
        dotColor: 'var(--mantine-color-teal-5)',
    },
    created_content: {
        label: 'Created',
        dotColor: 'var(--mantine-color-blue-5)',
    },
    insight: {
        label: 'Insight',
        dotColor: 'var(--mantine-color-violet-5)',
    },
};

const TARGET_ICON: Record<
    ManagedAgentAction['targetType'],
    typeof IconChartBar
> = {
    chart: IconChartBar,
    dashboard: IconLayoutDashboard,
    space: IconChartBar,
    project: IconChartBar,
};

const formatTimestamp = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
};

const formatRelative = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
};

const useHeartbeatInfo = (
    schedule: string,
    lastActionAt: string | null,
    enabled: boolean,
) => {
    const interval = useMemo(() => {
        const match = schedule.match(/^\*\/(\d+) /);
        if (match) return `${match[1]}m`;
        return schedule;
    }, [schedule]);

    const isRecent = lastActionAt
        ? Date.now() - new Date(lastActionAt).getTime() < 120000
        : false;

    return { interval, isRecent, enabled };
};

// --- Detail Sidebar ---

const DetailSidebar: FC<{
    action: ManagedAgentAction;
    onClose: () => void;
}> = ({ action, onClose }) => {
    const config = ACTION_CONFIG[action.actionType];

    const chartLink =
        action.targetType === 'chart'
            ? `/projects/${action.projectUuid}/saved/${action.targetUuid}`
            : action.targetType === 'dashboard'
              ? `/projects/${action.projectUuid}/dashboards/${action.targetUuid}`
              : null;

    return (
        <Stack gap={0} h="100%" className={classes.sidebar}>
            {/* Header: action label + link icon + close */}
            <Stack gap={2} className={classes.sidebarHeader}>
                <Group justify="space-between" align="center">
                    <Group gap={6}>
                        <Box
                            className={classes.dot}
                            style={{ backgroundColor: config.dotColor }}
                        />
                        <Text fz="xs" c="dimmed">
                            {config.label} &middot; {action.targetType}
                        </Text>
                    </Group>
                    <Group gap={2}>
                        {chartLink && (
                            <UnstyledButton
                                component="a"
                                href={chartLink}
                                className={classes.closeBtn}
                            >
                                <IconExternalLink size={14} />
                            </UnstyledButton>
                        )}
                        <UnstyledButton
                            onClick={onClose}
                            className={classes.closeBtn}
                        >
                            <IconX size={14} />
                        </UnstyledButton>
                    </Group>
                </Group>
                <Text fz="sm" fw={600} lineClamp={1}>
                    {action.targetName}
                </Text>
            </Stack>

            {/* Content */}
            <Stack gap="sm" p="md" style={{ overflow: 'auto', flex: 1 }}>
                <Text fz="sm" fw={600}>
                    Description
                </Text>
                <Text fz="xs" lh={1.7} c="dimmed">
                    {action.description}
                </Text>
            </Stack>
        </Stack>
    );
};

// --- Table Row ---

const ActionRow: FC<{
    action: ManagedAgentAction;
    selected: boolean;
    onSelect: (action: ManagedAgentAction) => void;
}> = ({ action, selected, onSelect }) => {
    const config = ACTION_CONFIG[action.actionType];
    const TargetIcon = TARGET_ICON[action.targetType];

    return (
        <Table.Tr
            className={`${classes.row} ${selected ? classes.rowSelected : ''}`}
            onClick={() => onSelect(action)}
        >
            <Table.Td w={160}>
                <span className={classes.timestamp}>
                    {formatTimestamp(action.createdAt)}
                </span>
            </Table.Td>
            <Table.Td w={100}>
                <span className={classes.actionPill}>
                    <Box
                        className={classes.dot}
                        style={{ backgroundColor: config.dotColor }}
                    />
                    {config.label}
                </span>
            </Table.Td>
            <Table.Td w={250}>
                <Group gap={6} wrap="nowrap">
                    <TargetIcon
                        size={14}
                        color="var(--mantine-color-dimmed)"
                        style={{ flexShrink: 0 }}
                    />
                    <TruncatedText maxWidth={220} fz="xs" fw={500}>
                        {action.targetName}
                    </TruncatedText>
                </Group>
            </Table.Td>
            <Table.Td className={classes.messageCell}>
                <TruncatedText maxWidth={9999} fz="xs" c="dimmed">
                    {action.description}
                </TruncatedText>
            </Table.Td>
        </Table.Tr>
    );
};

// --- Page ---

// ts-unused-exports:disable-next-line
export const ManagedAgentActivityPage: FC = () => {
    const { data: actions, isLoading } = useManagedAgentActions();
    const { data: settings } = useManagedAgentSettings();
    const [selected, setSelected] = useState<ManagedAgentAction | null>(null);
    const lastActionAt = actions?.[0]?.createdAt ?? null;
    const heartbeat = useHeartbeatInfo(
        settings?.scheduleCron ?? '*/5 * * * *',
        lastActionAt,
        settings?.enabled ?? false,
    );

    const filtered = actions ?? [];

    if (isLoading) {
        return (
            <Box className={classes.loading}>
                <Loader size="sm" />
            </Box>
        );
    }

    return (
        <Stack
            h={`calc(100vh - ${NAVBAR_HEIGHT}px)`}
            gap={0}
            style={{ flex: 1 }}
        >
            <PanelGroup direction="horizontal">
                <Panel
                    id="activity-table"
                    defaultSize={selected ? 65 : 100}
                    minSize={40}
                >
                    <Box className={classes.page}>
                        <Stack gap="md">
                            <Group gap="sm" align="center">
                                <Title order={4} fw={600}>
                                    Agent Activity
                                </Title>
                                <Tooltip
                                    label={
                                        heartbeat.enabled
                                            ? heartbeat.isRecent
                                                ? 'Running now'
                                                : `Runs every ${heartbeat.interval}`
                                            : 'Disabled'
                                    }
                                >
                                    <Group
                                        gap={5}
                                        className={classes.statusPill}
                                    >
                                        <Box
                                            className={
                                                heartbeat.enabled &&
                                                heartbeat.isRecent
                                                    ? classes.statusDotPulse
                                                    : classes.statusDot
                                            }
                                            style={{
                                                backgroundColor:
                                                    heartbeat.enabled
                                                        ? 'var(--mantine-color-green-5)'
                                                        : 'var(--mantine-color-gray-4)',
                                            }}
                                        />
                                        <Text fz={11} fw={500} c="dimmed">
                                            {heartbeat.enabled
                                                ? heartbeat.interval
                                                : 'Off'}
                                        </Text>
                                    </Group>
                                </Tooltip>
                                {lastActionAt && (
                                    <Text fz={11} c="dimmed">
                                        {formatRelative(lastActionAt)}
                                    </Text>
                                )}
                            </Group>

                            {filtered.length === 0 ? (
                                <Box className={classes.empty}>
                                    <Text fw={500} fz="sm" mt="xs">
                                        No activity yet
                                    </Text>
                                    <Text fz="xs" c="dimmed">
                                        The agent runs on a schedule — check
                                        back soon.
                                    </Text>
                                </Box>
                            ) : (
                                <Box className={classes.tableWrapper}>
                                    <Table className={classes.table}>
                                        <Table.Thead>
                                            <Table.Tr>
                                                <Table.Th>Timestamp</Table.Th>
                                                <Table.Th>Action</Table.Th>
                                                <Table.Th>Name</Table.Th>
                                                <Table.Th>Message</Table.Th>
                                            </Table.Tr>
                                        </Table.Thead>
                                        <Table.Tbody>
                                            {filtered.map((action) => (
                                                <ActionRow
                                                    key={action.actionUuid}
                                                    action={action}
                                                    selected={
                                                        selected?.actionUuid ===
                                                        action.actionUuid
                                                    }
                                                    onSelect={setSelected}
                                                />
                                            ))}
                                        </Table.Tbody>
                                    </Table>
                                </Box>
                            )}
                        </Stack>
                    </Box>
                </Panel>

                {selected && (
                    <>
                        <PanelResizeHandle className={classes.resizeHandle} />
                        <Panel
                            id="detail-sidebar"
                            defaultSize={35}
                            minSize={25}
                            maxSize={50}
                        >
                            <DetailSidebar
                                action={selected}
                                onClose={() => setSelected(null)}
                            />
                        </Panel>
                    </>
                )}
            </PanelGroup>
        </Stack>
    );
};
