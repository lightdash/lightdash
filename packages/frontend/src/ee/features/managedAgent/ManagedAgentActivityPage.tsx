import {
    ActionIcon,
    Box,
    Group,
    Loader,
    Menu,
    Popover,
    Select,
    Stack,
    Switch,
    Table,
    Text,
    Title,
    UnstyledButton,
} from '@mantine-8/core';
import {
    IconArrowBackUp,
    IconBolt,
    IconBrandSlack,
    IconChartBar,
    IconDots,
    IconExternalLink,
    IconLayoutDashboard,
    IconX,
} from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, type FC, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useParams } from 'react-router';
import { lightdashApi } from '../../../api';
import { NAVBAR_HEIGHT } from '../../../components/common/Page/constants';
import { SlackChannelSelect } from '../../../components/common/SlackChannelSelect';
import TruncatedText from '../../../components/common/TruncatedText';
import { useGetSlack, useSlackChannels } from '../../../hooks/slack/useSlack';
import { useSavedQuery } from '../../../hooks/useSavedQuery';
import { useManagedAgentActions } from './hooks/useManagedAgentActions';
import { useManagedAgentSettings } from './hooks/useManagedAgentSettings';
import classes from './ManagedAgentActivityPage.module.css';
import type { ManagedAgentAction } from './types';

const reverseAction = async (projectUuid: string, actionUuid: string) =>
    lightdashApi({
        url: `/projects/${projectUuid}/managed-agent/actions/${actionUuid}/reverse`,
        method: 'POST',
        body: undefined,
    });

const updateSettings = async (
    projectUuid: string,
    body: {
        enabled?: boolean;
        scheduleCron?: string;
        slackChannelId?: string | null;
    },
) =>
    lightdashApi({
        url: `/projects/${projectUuid}/managed-agent/settings`,
        method: 'PATCH',
        body: JSON.stringify(body),
    });

const SCHEDULE_OPTIONS = [
    { value: '*/5 * * * *', label: 'Every 5 min' },
    { value: '*/15 * * * *', label: 'Every 15 min' },
    { value: '*/30 * * * *', label: 'Every 30 min' },
    { value: '0 * * * *', label: 'Hourly' },
    { value: '0 */6 * * *', label: 'Every 6 hours' },
    { value: '0 0 * * *', label: 'Daily' },
];

const SetupSection: FC<{
    projectUuid: string;
    enabled: boolean;
    schedule: string;
    slackChannelId: string | null;
    isLoading: boolean;
}> = ({
    projectUuid,
    enabled,
    schedule: initialSchedule,
    slackChannelId: initialSlackChannelId,
    isLoading,
}) => {
    const queryClient = useQueryClient();
    const { data: slackInstallation } = useGetSlack();
    const organizationHasSlack = !!slackInstallation?.organizationUuid;

    const { data: resolvedChannels } = useSlackChannels(
        '',
        {
            includeChannelIds: initialSlackChannelId
                ? [initialSlackChannelId]
                : undefined,
        },
        { enabled: !!initialSlackChannelId && organizationHasSlack },
    );
    const slackChannelName =
        resolvedChannels?.find((c) => c.id === initialSlackChannelId)?.name ??
        initialSlackChannelId;

    const mutation = useMutation({
        mutationFn: (body: Parameters<typeof updateSettings>[1]) =>
            updateSettings(projectUuid, body),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: ['managed-agent-settings', projectUuid],
            });
        },
    });

    const handleToggle = (val: boolean) => {
        mutation.mutate({ enabled: val });
    };

    const [slackPopoverOpen, setSlackPopoverOpen] = useState(false);
    const [schedulePopoverOpen, setSchedulePopoverOpen] = useState(false);

    const handleSlackChannelChange = useCallback(
        (channelId: string | null) => {
            mutation.mutate({ slackChannelId: channelId });
            setSlackPopoverOpen(false);
        },
        [mutation],
    );

    const handleScheduleChange = useCallback(
        (value: string | null) => {
            if (value) {
                mutation.mutate({ scheduleCron: value });
                setSchedulePopoverOpen(false);
            }
        },
        [mutation],
    );

    const handleClearSlack = useCallback(() => {
        mutation.mutate({ slackChannelId: null });
    }, [mutation]);

    const scheduleLabel =
        SCHEDULE_OPTIONS.find(
            (o) => o.value === initialSchedule,
        )?.label?.replace(' (recommended)', '') ?? initialSchedule;

    return (
        <Stack gap={0}>
            <Group justify="space-between" align="center" pb="md">
                <Stack gap={0}>
                    <Group gap="sm" align="center">
                        <Box className={classes.setupOrb}>
                            <IconBolt size={16} />
                        </Box>
                        <Title order={4} fw={700}>
                            Autopilot
                        </Title>
                        {enabled && (
                            <Popover
                                opened={schedulePopoverOpen}
                                onChange={setSchedulePopoverOpen}
                                position="bottom-start"
                                width={220}
                                shadow="md"
                            >
                                <Popover.Target>
                                    <UnstyledButton
                                        className={classes.activeBadge}
                                        onClick={() =>
                                            setSchedulePopoverOpen((o) => !o)
                                        }
                                    >
                                        <Box
                                            className={classes.activeDotInline}
                                        />
                                        Active &middot; {scheduleLabel}
                                    </UnstyledButton>
                                </Popover.Target>
                                <Popover.Dropdown>
                                    <Text fz="xs" fw={500} mb="xs">
                                        Run frequency
                                    </Text>
                                    <Select
                                        data={SCHEDULE_OPTIONS}
                                        value={initialSchedule}
                                        onChange={handleScheduleChange}
                                        size="xs"
                                    />
                                </Popover.Dropdown>
                            </Popover>
                        )}
                    </Group>
                    <Text fz="xs" c="dimmed" ml={46}>
                        Your project health agent
                    </Text>
                </Stack>
                <Group gap="sm" align="center">
                    {organizationHasSlack && enabled && (
                        <>
                            {initialSlackChannelId ? (
                                <Group
                                    gap={6}
                                    px="sm"
                                    py={4}
                                    bg="white"
                                    className={classes.slackBadge}
                                >
                                    <IconBrandSlack size={14} />
                                    <Text fz="xs" fw={500}>
                                        {slackChannelName}
                                    </Text>
                                    <ActionIcon
                                        variant="transparent"
                                        size="xs"
                                        color="gray"
                                        onClick={handleClearSlack}
                                    >
                                        <IconX size={12} />
                                    </ActionIcon>
                                </Group>
                            ) : (
                                <Popover
                                    opened={slackPopoverOpen}
                                    onChange={setSlackPopoverOpen}
                                    position="bottom-end"
                                    width={280}
                                    shadow="md"
                                >
                                    <Popover.Target>
                                        <ActionIcon
                                            variant="subtle"
                                            color="gray"
                                            size="md"
                                            onClick={() =>
                                                setSlackPopoverOpen((o) => !o)
                                            }
                                        >
                                            <IconBrandSlack size={18} />
                                        </ActionIcon>
                                    </Popover.Target>
                                    <Popover.Dropdown>
                                        <Text fz="xs" fw={500} mb="xs">
                                            Post summaries to Slack
                                        </Text>
                                        <SlackChannelSelect
                                            placeholder="Search channels..."
                                            size="xs"
                                            value={null}
                                            onChange={handleSlackChannelChange}
                                        />
                                    </Popover.Dropdown>
                                </Popover>
                            )}
                        </>
                    )}
                    <Switch
                        checked={enabled}
                        onChange={(e) => handleToggle(e.currentTarget.checked)}
                        disabled={isLoading || mutation.isLoading}
                        size="sm"
                        color="dark"
                    />
                </Group>
            </Group>
            <Box className={classes.headerDivider} />
        </Stack>
    );
};

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

// --- Detail Sidebar ---

const MetadataLabel: FC<{ label: string }> = ({ label }) => (
    <Text fz={10} fw={600} c="dimmed" tt="uppercase" lts={0.5}>
        {label}
    </Text>
);

const MetadataFieldList: FC<{ label: string; fields: string[] }> = ({
    label,
    fields,
}) =>
    fields.length > 0 ? (
        <Stack gap={4}>
            <MetadataLabel label={label} />
            <Group gap={4}>
                {fields.map((f) => (
                    <Text
                        key={f}
                        fz={11}
                        ff="monospace"
                        className={classes.fieldPill}
                    >
                        {f}
                    </Text>
                ))}
            </Group>
        </Stack>
    ) : null;

const ChartDetails: FC<{ metadata: Record<string, unknown> }> = ({
    metadata,
}) => {
    const chartAsCode = metadata.chart_as_code as
        | Record<string, unknown>
        | undefined;
    if (!chartAsCode) return null;

    const metricQuery = chartAsCode.metricQuery as
        | Record<string, unknown>
        | undefined;
    const chartConfig = chartAsCode.chartConfig as
        | Record<string, unknown>
        | undefined;
    const dimensions = (metricQuery?.dimensions as string[]) ?? [];
    const metrics = (metricQuery?.metrics as string[]) ?? [];
    const exploreName = (metricQuery?.exploreName as string) ?? null;
    const chartType = (chartConfig?.type as string) ?? null;

    return (
        <Stack gap="sm">
            <MetadataLabel label="Chart info" />
            <Group gap="lg">
                {chartType && (
                    <Stack gap={2}>
                        <Text fz={10} c="dimmed">
                            Type
                        </Text>
                        <Text fz="xs" fw={500}>
                            {chartType}
                        </Text>
                    </Stack>
                )}
                {exploreName && (
                    <Stack gap={2}>
                        <Text fz={10} c="dimmed">
                            Explore
                        </Text>
                        <Text fz="xs" fw={500}>
                            {exploreName}
                        </Text>
                    </Stack>
                )}
            </Group>
            <MetadataFieldList label="Dimensions" fields={dimensions} />
            <MetadataFieldList label="Metrics" fields={metrics} />
        </Stack>
    );
};

const StaleDetails: FC<{ metadata: Record<string, unknown> }> = ({
    metadata,
}) => {
    const viewsCount = metadata.views_count as number | undefined;
    const lastViewedAt = metadata.last_viewed_at as string | undefined;

    if (viewsCount === undefined && !lastViewedAt) return null;

    return (
        <Stack gap="sm">
            <MetadataLabel label="Usage" />
            <Group gap="lg">
                {viewsCount !== undefined && (
                    <Stack gap={2}>
                        <Text fz={10} c="dimmed">
                            Total views
                        </Text>
                        <Text fz="xs" fw={500}>
                            {viewsCount}
                        </Text>
                    </Stack>
                )}
                {lastViewedAt && (
                    <Stack gap={2}>
                        <Text fz={10} c="dimmed">
                            Last viewed
                        </Text>
                        <Text fz="xs" fw={500}>
                            {new Date(lastViewedAt).toLocaleDateString()}
                        </Text>
                    </Stack>
                )}
            </Group>
        </Stack>
    );
};

const DetailSidebar: FC<{
    action: ManagedAgentAction;
    onClose: () => void;
}> = ({ action, onClose }) => {
    const queryClient = useQueryClient();
    const config = ACTION_CONFIG[action.actionType];
    const isReversed = !!action.reversedAt;

    const revertMutation = useMutation({
        mutationFn: () => reverseAction(action.projectUuid, action.actionUuid),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: ['managed-agent-actions', action.projectUuid],
            });
        },
    });

    const chartLink =
        action.targetType === 'chart'
            ? `/projects/${action.projectUuid}/saved/${action.targetUuid}`
            : action.targetType === 'dashboard'
              ? `/projects/${action.projectUuid}/dashboards/${action.targetUuid}`
              : null;

    const TargetIcon = TARGET_ICON[action.targetType];

    // Fetch chart description from the API when viewing a chart action
    const { data: savedChart } = useSavedQuery({
        uuidOrSlug:
            action.targetType === 'chart' ? action.targetUuid : undefined,
        projectUuid: action.projectUuid,
    });
    const chartDescription = savedChart?.description ?? null;

    const hasChartDetails = !!action.metadata.chart_as_code;
    const hasStaleDetails =
        action.metadata.views_count !== undefined ||
        !!action.metadata.last_viewed_at;

    return (
        <Stack gap={0} h="100%" className={classes.sidebar}>
            {/* Header */}
            <Stack gap={2} className={classes.sidebarHeader}>
                <Group justify="space-between" align="center">
                    <Group gap={6}>
                        <Box
                            className={classes.dot}
                            style={{ backgroundColor: config.dotColor }}
                        />
                        <Text fz="xs" c="dimmed">
                            {config.label}
                        </Text>
                    </Group>
                    <Group gap={2}>
                        <Menu position="bottom-end" withinPortal>
                            <Menu.Target>
                                <UnstyledButton className={classes.closeBtn}>
                                    <IconDots size={14} />
                                </UnstyledButton>
                            </Menu.Target>
                            <Menu.Dropdown>
                                {chartLink && (
                                    <Menu.Item
                                        component="a"
                                        href={chartLink}
                                        leftSection={
                                            <IconExternalLink size={14} />
                                        }
                                    >
                                        Open {action.targetType}
                                    </Menu.Item>
                                )}
                                <Menu.Item
                                    leftSection={<IconArrowBackUp size={14} />}
                                    disabled={
                                        isReversed || revertMutation.isLoading
                                    }
                                    onClick={() => revertMutation.mutate()}
                                    color={isReversed ? undefined : 'red'}
                                >
                                    {isReversed
                                        ? 'Already reverted'
                                        : 'Revert action'}
                                </Menu.Item>
                            </Menu.Dropdown>
                        </Menu>
                        <UnstyledButton
                            onClick={onClose}
                            className={classes.closeBtn}
                        >
                            <IconX size={14} />
                        </UnstyledButton>
                    </Group>
                </Group>
                <Group gap={6} wrap="nowrap">
                    {(action.targetType === 'chart' ||
                        action.targetType === 'dashboard') && (
                        <TargetIcon
                            size={16}
                            color="var(--mantine-color-dimmed)"
                            style={{ flexShrink: 0 }}
                        />
                    )}
                    <TruncatedText maxWidth={260} fz="sm" fw={600}>
                        {action.targetName}
                    </TruncatedText>
                </Group>
            </Stack>

            {/* Content */}
            <Stack gap="md" p="md" style={{ overflow: 'auto', flex: 1 }}>
                {/* Chart or stale details */}
                {hasChartDetails && <ChartDetails metadata={action.metadata} />}
                {hasStaleDetails && <StaleDetails metadata={action.metadata} />}

                {/* Divider if we showed details above */}
                {(hasChartDetails || hasStaleDetails) && (
                    <Box className={classes.headerDivider} />
                )}

                {/* Chart description if available */}
                {chartDescription && (
                    <Stack gap={4}>
                        <MetadataLabel label="Description" />
                        <Text fz="xs" lh={1.7}>
                            {chartDescription}
                        </Text>
                    </Stack>
                )}

                {/* Agent reasoning */}
                <Stack gap={4}>
                    <MetadataLabel label="Agent reasoning" />
                    <Text fz="xs" lh={1.7} c="dimmed">
                        {action.description}
                    </Text>
                </Stack>
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
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: actions, isLoading } = useManagedAgentActions();
    const { data: settings, isLoading: settingsLoading } =
        useManagedAgentSettings();
    const [selected, setSelected] = useState<ManagedAgentAction | null>(null);
    const filtered = actions ?? [];

    if (isLoading || settingsLoading) {
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
                        <Stack gap="lg">
                            <SetupSection
                                projectUuid={projectUuid!}
                                enabled={settings?.enabled ?? false}
                                schedule={
                                    settings?.scheduleCron ?? '*/30 * * * *'
                                }
                                slackChannelId={
                                    settings?.slackChannelId ?? null
                                }
                                isLoading={settingsLoading}
                            />

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
