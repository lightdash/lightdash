import { subject } from '@casl/ability';
import {
    type ApiError,
    type ContentVerificationInfo,
    type Dashboard,
    getManagedAgentActionCategory,
    ManagedAgentRunStatus,
    ManagedAgentScheduleOption,
    type Project,
    type SavedChart,
    type UpdatedByUser,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Box,
    Button,
    Group,
    Loader,
    Menu,
    Select,
    Stack,
    Switch,
    Table,
    Text,
    Title,
    Tooltip,
    UnstyledButton,
} from '@mantine-8/core';
import {
    IconAlertTriangle,
    IconArrowBackUp,
    IconBolt,
    IconBrandSlack,
    IconChartBar,
    IconChevronRight,
    IconCircleCheck,
    IconClock,
    IconDatabase,
    IconDots,
    IconExternalLink,
    IconEye,
    IconFolder,
    IconHash,
    IconLayoutDashboard,
    IconPlayerPlay,
    IconSettings,
    IconTool,
    IconTrash,
    IconX,
} from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNowStrict } from 'date-fns';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useParams } from 'react-router';
import { lightdashApi } from '../../../api';
import MantineIcon from '../../../components/common/MantineIcon';
import { NAVBAR_HEIGHT } from '../../../components/common/Page/constants';
import InfoRow from '../../../components/common/PageHeader/InfoRow';
import { SlackChannelSelect } from '../../../components/common/SlackChannelSelect';
import TruncatedText from '../../../components/common/TruncatedText';
import ForbiddenPanel from '../../../components/ForbiddenPanel';
import { useChartViewStats } from '../../../hooks/chart/useChartViewStats';
import { useDashboardQuery } from '../../../hooks/dashboard/useDashboard';
import { useGetSlack } from '../../../hooks/slack/useSlack';
import useToaster from '../../../hooks/toaster/useToaster';
import { useProject } from '../../../hooks/useProject';
import { useSavedQuery } from '../../../hooks/useSavedQuery';
import useApp from '../../../providers/App/useApp';
import { useManagedAgentActions } from './hooks/useManagedAgentActions';
import { useManagedAgentLatestRun } from './hooks/useManagedAgentLatestRun';
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
        schedule?: ManagedAgentScheduleOption;
        slackChannelId?: string | null;
        toolSettings?: Record<string, boolean>;
    },
) =>
    lightdashApi({
        url: `/projects/${projectUuid}/managed-agent/settings`,
        method: 'PATCH',
        body: JSON.stringify(body),
    });

const runHeartbeat = async (projectUuid: string) =>
    lightdashApi<undefined>({
        url: `/projects/${projectUuid}/managed-agent/run`,
        method: 'POST',
        body: undefined,
    });

const SUMMARY_SUBTITLE_MAX = 120;

const summaryToSubtitle = (
    summary: string | null | undefined,
): string | null => {
    if (!summary) return null;
    const firstLine = summary
        .split('\n')
        .map((l) => l.trim())
        .find(
            (l) => l.length > 0 && !l.startsWith('#') && !l.startsWith('---'),
        );
    if (!firstLine) return null;
    return firstLine.length <= SUMMARY_SUBTITLE_MAX
        ? firstLine
        : `${firstLine.slice(0, SUMMARY_SUBTITLE_MAX - 1)}…`;
};

const SCHEDULE_OPTIONS = [
    { value: ManagedAgentScheduleOption.EVERY_6_HOURS, label: 'Every 6 hours' },
    {
        value: ManagedAgentScheduleOption.EVERY_12_HOURS,
        label: 'Every 12 hours',
    },
    { value: ManagedAgentScheduleOption.DAILY, label: 'Daily' },
    { value: ManagedAgentScheduleOption.EVERY_2_DAYS, label: 'Every 2 days' },
    { value: ManagedAgentScheduleOption.WEEKLY, label: 'Weekly' },
];

const CAPABILITY_GROUPS = [
    {
        key: 'readOnly',
        label: 'Read content',
        description:
            'Reads project health signals, recent Autopilot actions, stale charts and dashboards, broken content, chart definitions, user questions, popular content, preview projects, and slow query history.',
        locked: true,
    },
    {
        key: 'createContent',
        label: 'Create content',
        description:
            'Allows Autopilot to create net new suggested charts in the Agent Suggestions space from chart-as-code definitions.',
        locked: false,
    },
    {
        key: 'modifyExistingContent',
        label: 'Modify existing content',
        description:
            'Allows Autopilot to soft-delete stale charts or dashboards, update broken chart definitions, and reverse its own previous content changes.',
        locked: false,
    },
];

const SetupSection: FC<{
    enabled: boolean;
    schedule: ManagedAgentScheduleOption;
    settingsOpen: boolean;
    onOpenSettings: () => void;
    onRunNow: () => void;
    isRunNowLoading: boolean;
    isRunning: boolean;
}> = ({
    enabled,
    schedule: initialSchedule,
    settingsOpen,
    onOpenSettings,
    onRunNow,
    isRunNowLoading,
    isRunning,
}) => {
    const scheduleLabel =
        SCHEDULE_OPTIONS.find((o) => o.value === initialSchedule)?.label ??
        'Daily';

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
                        <Box className={classes.activeBadge}>
                            <Box
                                className={
                                    enabled
                                        ? classes.activeDotInline
                                        : classes.disabledDotInline
                                }
                            />
                            {enabled ? (
                                <>Active &middot; {scheduleLabel}</>
                            ) : (
                                'Disabled'
                            )}
                        </Box>
                    </Group>
                    <Text fz="xs" c="dimmed" ml={46}>
                        Fixes broken charts, flags stale content, suggests new
                        ones
                    </Text>
                </Stack>
                <Group gap="xs">
                    <Tooltip
                        label={
                            isRunning
                                ? 'Autopilot is running…'
                                : enabled
                                  ? 'Run Autopilot now'
                                  : 'Enable Autopilot to run now'
                        }
                    >
                        <ActionIcon
                            aria-label="Run Autopilot now"
                            variant="default"
                            color="dark"
                            size="md"
                            radius="md"
                            onClick={onRunNow}
                            disabled={!enabled || isRunNowLoading || isRunning}
                            loading={isRunNowLoading || isRunning}
                        >
                            <MantineIcon icon={IconPlayerPlay} size="sm" />
                        </ActionIcon>
                    </Tooltip>
                    <Button
                        variant={settingsOpen ? 'light' : 'default'}
                        color="dark"
                        size="xs"
                        leftSection={<IconSettings size={14} />}
                        onClick={onOpenSettings}
                    >
                        Settings
                    </Button>
                </Group>
            </Group>
            <Box className={classes.headerDivider} />
        </Stack>
    );
};

const ACTION_CONFIG: Record<
    ManagedAgentAction['actionType'],
    { label: string; dotColor: string; tooltip?: string }
> = {
    flagged_stale: {
        label: 'Flagged stale',
        dotColor: 'var(--mantine-color-orange-5)',
        tooltip:
            'Marked as unused. Future Autopilot runs will review flagged items and clean them up.',
    },
    soft_deleted: {
        label: 'Deleted',
        dotColor: 'var(--mantine-color-red-5)',
    },
    flagged_broken: {
        label: 'Flagged broken',
        dotColor: 'var(--mantine-color-red-5)',
        tooltip:
            'Marked as broken. Future Autopilot runs will review flagged items and attempt to fix them.',
    },
    flagged_slow: {
        label: 'Flagged slow',
        dotColor: 'var(--mantine-color-yellow-6)',
        tooltip:
            'Marked as slow. Future Autopilot runs will review flagged items and try to optimize them.',
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

const revertActionLabel = (
    category: ReturnType<typeof getManagedAgentActionCategory>,
    isReversed: boolean,
): string => {
    if (category === 'undo') {
        return isReversed ? 'Already undone' : 'Undo action';
    }
    return isReversed ? 'Already dismissed' : 'Dismiss';
};

const TARGET_ICON: Record<
    ManagedAgentAction['targetType'],
    typeof IconChartBar
> = {
    chart: IconChartBar,
    dashboard: IconLayoutDashboard,
    space: IconChartBar,
    project: IconDatabase,
};

const formatTimestamp = (dateStr: string) =>
    formatDistanceToNowStrict(new Date(dateStr), { addSuffix: true });

const formatAbsoluteTimestamp = (dateStr: string) =>
    format(new Date(dateStr), 'MMM d, HH:mm');

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

const BrokenDetails: FC<{ metadata: Record<string, unknown> }> = ({
    metadata,
}) => {
    const error = metadata.error as string | undefined;
    const errorType = metadata.error_type as string | undefined;
    const source = metadata.source as string | undefined;
    if (!error && !errorType && !source) return null;

    const hasRows = !!errorType || !!source;

    return (
        <Stack gap="sm">
            <MetadataLabel label="Validation error" />
            {hasRows && (
                <Stack gap={10}>
                    {errorType && (
                        <InfoRow icon={IconAlertTriangle} label="Type">
                            {errorType}
                        </InfoRow>
                    )}
                    {source && (
                        <InfoRow icon={IconHash} label="Source">
                            {source}
                        </InfoRow>
                    )}
                </Stack>
            )}
            {error && (
                <Text fz="xs" lh={1.7} ff="monospace">
                    {error}
                </Text>
            )}
        </Stack>
    );
};

const SlowDetails: FC<{ metadata: Record<string, unknown> }> = ({
    metadata,
}) => {
    const execMs = metadata.execution_time_ms as number | undefined;
    const context = metadata.context as string | undefined;
    if (execMs === undefined) return null;

    return (
        <Stack gap="sm">
            <MetadataLabel label="Performance" />
            <Stack gap={10}>
                <InfoRow icon={IconClock} label="Execution time">
                    {(execMs / 1000).toFixed(1)}s
                </InfoRow>
                {context && (
                    <InfoRow icon={IconHash} label="Context">
                        {context}
                    </InfoRow>
                )}
            </Stack>
        </Stack>
    );
};

type ContentContext = {
    description: string | null;
    projectUuid: string;
    spaceUuid: string | null;
    spaceName: string | null;
    updatedAt: Date | string | null;
    updatedByUser: UpdatedByUser | undefined;
    verification: ContentVerificationInfo | null;
    deletedAt: Date | undefined;
    views?: number;
};

const toContentContext = (content: SavedChart | Dashboard): ContentContext => ({
    description: content.description?.trim() || null,
    projectUuid: content.projectUuid,
    spaceUuid: content.spaceUuid ?? null,
    spaceName: content.spaceName ?? null,
    updatedAt: content.updatedAt ?? null,
    updatedByUser: content.updatedByUser,
    verification: content.verification,
    deletedAt: content.deletedAt,
    views: 'views' in content ? content.views : undefined,
});

const ContentContextDetails: FC<{
    label: string;
    context: ContentContext;
}> = ({ label, context }) => {
    const lastUpdatedBy = context.updatedByUser
        ? `${context.updatedByUser.firstName} ${context.updatedByUser.lastName}`.trim()
        : null;
    const verifiedBy = context.verification?.verifiedBy
        ? `${context.verification.verifiedBy.firstName} ${context.verification.verifiedBy.lastName}`.trim()
        : null;
    const spaceUrl = context.spaceUuid
        ? `/projects/${context.projectUuid}/spaces/${context.spaceUuid}`
        : null;

    return (
        <Stack gap="sm">
            <MetadataLabel label={label} />
            <Stack gap={10}>
                {context.spaceName && (
                    <InfoRow icon={IconFolder} label="Space">
                        {spaceUrl ? (
                            <Anchor href={spaceUrl} fz="xs" fw={500}>
                                {context.spaceName}
                            </Anchor>
                        ) : (
                            context.spaceName
                        )}
                    </InfoRow>
                )}
                {context.updatedAt && (
                    <InfoRow icon={IconClock} label="Last modified">
                        <Tooltip
                            label={formatAbsoluteTimestamp(
                                new Date(context.updatedAt).toISOString(),
                            )}
                            withinPortal
                        >
                            <span>
                                {formatDistanceToNowStrict(
                                    new Date(context.updatedAt),
                                    { addSuffix: true },
                                )}
                                {lastUpdatedBy ? ` by ${lastUpdatedBy}` : ''}
                            </span>
                        </Tooltip>
                    </InfoRow>
                )}
                {typeof context.views === 'number' && (
                    <InfoRow icon={IconEye} label="Total views">
                        {context.views.toLocaleString()}
                    </InfoRow>
                )}
                {verifiedBy && (
                    <InfoRow icon={IconCircleCheck} label="Verified">
                        by {verifiedBy}
                    </InfoRow>
                )}
                {context.deletedAt && (
                    <InfoRow icon={IconTrash} label="Deleted">
                        {formatAbsoluteTimestamp(
                            new Date(context.deletedAt).toISOString(),
                        )}
                    </InfoRow>
                )}
            </Stack>
        </Stack>
    );
};

const getProjectBranch = (project: Project): string | null =>
    'branch' in project.dbtConnection ? project.dbtConnection.branch : null;

const ProjectContextDetails: FC<{
    project: Project;
    upstreamProject?: Project;
    createdAt?: string | null;
}> = ({ project, upstreamProject, createdAt }) => {
    const projectLink = `/projects/${project.projectUuid}`;
    const upstreamProjectLink = upstreamProject
        ? `/projects/${upstreamProject.projectUuid}`
        : null;
    const branch = getProjectBranch(project);
    const isPreviewProject = !!project.upstreamProjectUuid;

    return (
        <Stack gap="sm">
            <MetadataLabel label="Project metadata" />
            <Stack gap={10}>
                <InfoRow icon={IconDatabase} label="Project">
                    <Anchor href={projectLink} fz="xs" fw={500}>
                        {project.name}
                    </Anchor>
                </InfoRow>
                <InfoRow icon={IconHash} label="Type">
                    {isPreviewProject ? 'Preview project' : 'Project'}
                </InfoRow>
                {upstreamProject && (
                    <InfoRow icon={IconExternalLink} label="Upstream project">
                        {upstreamProjectLink ? (
                            <Anchor href={upstreamProjectLink} fz="xs" fw={500}>
                                {upstreamProject.name}
                            </Anchor>
                        ) : (
                            upstreamProject.name
                        )}
                    </InfoRow>
                )}
                {branch && (
                    <InfoRow icon={IconHash} label="Branch">
                        {branch}
                    </InfoRow>
                )}
                {createdAt && (
                    <InfoRow icon={IconClock} label="Created">
                        <Tooltip
                            label={formatAbsoluteTimestamp(createdAt)}
                            withinPortal
                        >
                            <span>{formatTimestamp(createdAt)}</span>
                        </Tooltip>
                    </InfoRow>
                )}
            </Stack>
        </Stack>
    );
};

const DetailSidebar: FC<{
    action: ManagedAgentAction;
    onClose: () => void;
}> = ({ action, onClose }) => {
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    const config = ACTION_CONFIG[action.actionType];
    const isReversed = !!action.reversedAt;
    const isProjectTarget = action.targetType === 'project';
    const category = getManagedAgentActionCategory(action.actionType);

    const revertMutation = useMutation<unknown, ApiError>({
        mutationFn: () => reverseAction(action.projectUuid, action.actionUuid),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: ['managed-agent-actions', action.projectUuid],
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title:
                    category === 'undo'
                        ? 'Could not undo action'
                        : 'Could not dismiss action',
                apiError: error,
            });
        },
    });

    const targetLink = isProjectTarget
        ? `/projects/${action.targetUuid}`
        : action.targetType === 'chart'
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
    const { data: dashboard } = useDashboardQuery({
        uuidOrSlug:
            action.targetType === 'dashboard' ? action.targetUuid : undefined,
        projectUuid: action.projectUuid,
        useQueryOptions: {
            onError: () => undefined,
        },
    });
    const { data: chartViewStats } = useChartViewStats(
        action.targetType === 'chart' ? action.targetUuid : undefined,
    );
    const { data: targetProject } = useProject(
        isProjectTarget ? action.targetUuid : undefined,
        {
            retry: false,
            onError: () => undefined,
        },
    );
    const { data: upstreamProject } = useProject(
        targetProject?.upstreamProjectUuid,
        {
            retry: false,
            onError: () => undefined,
        },
    );

    const baseContext: ContentContext | null = savedChart
        ? toContentContext(savedChart)
        : dashboard
          ? toContentContext(dashboard)
          : null;
    const metadataViews = action.metadata.views_count;
    const fallbackViews =
        chartViewStats?.views ??
        (typeof metadataViews === 'number' ? metadataViews : undefined);
    const contentContext: ContentContext | null = baseContext
        ? {
              ...baseContext,
              views: baseContext.views ?? fallbackViews,
          }
        : null;
    const contextLabel =
        action.targetType === 'dashboard'
            ? 'Dashboard context'
            : 'Chart context';

    const hasChartDetails = !!action.metadata.chart_as_code;
    const hasBrokenDetails =
        action.actionType === 'flagged_broken' &&
        (!!action.metadata.error ||
            !!action.metadata.error_type ||
            !!action.metadata.source);
    const hasSlowDetails =
        action.actionType === 'flagged_slow' &&
        typeof action.metadata.execution_time_ms === 'number';
    const projectCreatedAt =
        typeof action.metadata.created_at === 'string'
            ? action.metadata.created_at
            : null;
    const hasProjectDetails = !!targetProject;

    const reversedLabel = action.reversedAt
        ? `${formatDistanceToNowStrict(new Date(action.reversedAt))} ago${
              action.reversedByUser
                  ? ` by ${action.reversedByUser.firstName} ${action.reversedByUser.lastName}`
                  : ''
          }`
        : null;

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
                                <Menu.Item
                                    leftSection={<IconArrowBackUp size={14} />}
                                    disabled={
                                        isReversed || revertMutation.isLoading
                                    }
                                    onClick={() => revertMutation.mutate()}
                                    color={isReversed ? undefined : 'red'}
                                >
                                    {revertActionLabel(category, isReversed)}
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
                    <TargetIcon
                        size={16}
                        color="var(--mantine-color-dimmed)"
                        style={{ flexShrink: 0 }}
                    />
                    <TruncatedText maxWidth={260} fz="sm" fw={600}>
                        {action.targetName}
                    </TruncatedText>
                    {targetLink && (
                        <Tooltip label={`Open ${action.targetType}`}>
                            <ActionIcon
                                component="a"
                                href={targetLink}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={`Open ${action.targetType}`}
                                variant="subtle"
                                color="gray"
                                size="sm"
                                radius="md"
                                className={classes.titleAction}
                            >
                                <MantineIcon
                                    icon={IconExternalLink}
                                    size="sm"
                                />
                            </ActionIcon>
                        </Tooltip>
                    )}
                </Group>
            </Stack>

            {reversedLabel && (
                <Group gap={6} className={classes.reversedBanner} wrap="nowrap">
                    <MantineIcon
                        icon={IconArrowBackUp}
                        size="sm"
                        color="var(--mantine-color-dimmed)"
                    />
                    <Text fz="xs" c="dimmed">
                        {category === 'undo' ? 'Undone' : 'Dismissed'}{' '}
                        {reversedLabel}
                    </Text>
                </Group>
            )}

            {/* Content */}
            <Stack gap="md" p="md" style={{ overflow: 'auto', flex: 1 }}>
                {/* Resource-side metadata (space, last updated, verified, deleted) */}
                {contentContext && (
                    <ContentContextDetails
                        label={contextLabel}
                        context={contentContext}
                    />
                )}
                {targetProject && (
                    <ProjectContextDetails
                        project={targetProject}
                        upstreamProject={upstreamProject}
                        createdAt={projectCreatedAt}
                    />
                )}

                {/* Description */}
                {contentContext?.description && (
                    <Stack gap={4}>
                        <MetadataLabel label="Description" />
                        <Text fz="xs" lh={1.7}>
                            {contentContext.description}
                        </Text>
                    </Stack>
                )}

                {/* Action-specific details */}
                {hasChartDetails && <ChartDetails metadata={action.metadata} />}
                {hasSlowDetails && <SlowDetails metadata={action.metadata} />}
                {hasBrokenDetails && (
                    <BrokenDetails metadata={action.metadata} />
                )}

                {/* Divider if we showed details above */}
                {(hasChartDetails ||
                    hasBrokenDetails ||
                    hasSlowDetails ||
                    !!contentContext ||
                    hasProjectDetails) && (
                    <Box className={classes.headerDivider} />
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

const SettingsSidebar: FC<{
    projectUuid: string;
    enabled: boolean;
    schedule: ManagedAgentScheduleOption;
    slackChannelId: string | null;
    toolSettings: Record<string, boolean>;
    isLoading: boolean;
    onClose: () => void;
}> = ({
    projectUuid,
    enabled,
    schedule,
    slackChannelId,
    toolSettings,
    isLoading,
    onClose,
}) => {
    const queryClient = useQueryClient();
    const { data: slackInstallation } = useGetSlack();
    const organizationHasSlack = !!slackInstallation?.organizationUuid;
    const [slackNotificationsEnabled, setSlackNotificationsEnabled] =
        useState(!!slackChannelId);

    useEffect(() => {
        setSlackNotificationsEnabled(!!slackChannelId);
    }, [slackChannelId]);

    const mutation = useMutation({
        mutationFn: (body: Parameters<typeof updateSettings>[1]) =>
            updateSettings(projectUuid, body),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: ['managed-agent-settings', projectUuid],
            });
        },
    });

    const handleSlackChannelChange = useCallback(
        (channelId: string | null) => {
            setSlackNotificationsEnabled(!!channelId);
            mutation.mutate({ slackChannelId: channelId });
        },
        [mutation],
    );

    const handleScheduleChange = useCallback(
        (value: string | null) => {
            if (value) {
                mutation.mutate({
                    schedule: value as ManagedAgentScheduleOption,
                });
            }
        },
        [mutation],
    );

    const handleSlackPostingToggle = useCallback(
        (checked: boolean) => {
            setSlackNotificationsEnabled(checked);
            if (!checked) {
                mutation.mutate({ slackChannelId: null });
            }
        },
        [mutation],
    );

    const handleCapabilityToggle = useCallback(
        (capabilityName: string, checked: boolean) => {
            mutation.mutate({
                toolSettings: {
                    ...toolSettings,
                    [capabilityName]: checked,
                },
            });
        },
        [mutation, toolSettings],
    );

    return (
        <Stack gap={0} h="100%" className={classes.sidebar}>
            <Stack gap={2} className={classes.sidebarHeader}>
                <Group justify="space-between" align="center">
                    <Group gap={6}>
                        <IconSettings
                            size={16}
                            color="var(--mantine-color-dimmed)"
                        />
                        <Text fz="sm" fw={600}>
                            Autopilot settings
                        </Text>
                    </Group>
                    <UnstyledButton
                        onClick={onClose}
                        className={classes.closeBtn}
                    >
                        <IconX size={14} />
                    </UnstyledButton>
                </Group>
                <Text fz="xs" c="dimmed">
                    Configure how Autopilot monitors this project.
                </Text>
            </Stack>

            <Stack gap="lg" p="md" style={{ overflow: 'auto', flex: 1 }}>
                <Group
                    justify="space-between"
                    align="flex-start"
                    className={classes.settingsRow}
                >
                    <Stack gap={4}>
                        <Text fz="sm" fw={500}>
                            Enable Autopilot
                        </Text>
                        <Text fz="xs" c="dimmed">
                            Turn scheduled project health checks on or off.
                        </Text>
                    </Stack>
                    <Switch
                        checked={enabled}
                        onChange={(e) =>
                            mutation.mutate({
                                enabled: e.currentTarget.checked,
                            })
                        }
                        disabled={isLoading || mutation.isLoading}
                        size="xs"
                        color="ldDark"
                    />
                </Group>

                {enabled && (
                    <>
                        <Stack gap={6} className={classes.settingsRow}>
                            <Text fz="sm" fw={500}>
                                Schedule
                            </Text>
                            <Select
                                data={SCHEDULE_OPTIONS}
                                value={schedule}
                                onChange={handleScheduleChange}
                                size="sm"
                                disabled={isLoading || mutation.isLoading}
                            />
                        </Stack>

                        <Stack gap={8} className={classes.settingsRow}>
                            <Group justify="space-between" align="flex-start">
                                <Stack gap={4}>
                                    <Group gap={6}>
                                        <IconBrandSlack
                                            size={16}
                                            color="var(--mantine-color-dimmed)"
                                        />
                                        <Text fz="sm" fw={500}>
                                            Send updates to Slack
                                        </Text>
                                    </Group>
                                    <Text fz="xs" c="dimmed">
                                        Post Autopilot health check summaries to
                                        a Slack channel after each run.
                                    </Text>
                                </Stack>
                                {organizationHasSlack && (
                                    <Switch
                                        checked={slackNotificationsEnabled}
                                        onChange={(e) =>
                                            handleSlackPostingToggle(
                                                e.currentTarget.checked,
                                            )
                                        }
                                        disabled={mutation.isLoading}
                                        size="xs"
                                        color="ldDark"
                                    />
                                )}
                            </Group>
                            {organizationHasSlack ? (
                                slackNotificationsEnabled && (
                                    <Stack gap={6}>
                                        <SlackChannelSelect
                                            placeholder="Search channels..."
                                            size="sm"
                                            value={slackChannelId}
                                            onChange={handleSlackChannelChange}
                                        />
                                        <Text fz="xs" c="dimmed">
                                            Please invite Lightdash to this
                                            channel — we can&apos;t post
                                            messages until you do. (
                                            <Text
                                                component="span"
                                                inherit
                                                ff="monospace"
                                            >
                                                /invite @Lightdash
                                            </Text>
                                            )
                                        </Text>
                                    </Stack>
                                )
                            ) : (
                                <Stack gap="xs">
                                    <Text fz="xs" c="dimmed">
                                        Connect Slack to post Autopilot
                                        summaries to a channel.
                                    </Text>
                                    <Button
                                        component="a"
                                        href="/generalSettings/integrations"
                                        variant="default"
                                        size="xs"
                                        leftSection={
                                            <IconExternalLink size={14} />
                                        }
                                    >
                                        Open integrations
                                    </Button>
                                </Stack>
                            )}
                        </Stack>

                        <Stack gap="md" className={classes.settingsRow}>
                            <Stack gap={4}>
                                <Group gap={6}>
                                    <IconTool
                                        size={16}
                                        color="var(--mantine-color-dimmed)"
                                    />
                                    <Text fz="sm" fw={500}>
                                        Permissions
                                    </Text>
                                </Group>
                                <Text fz="xs" c="dimmed">
                                    Choose what Autopilot can do.
                                </Text>
                            </Stack>
                            <Stack gap={0} className={classes.toolTogglePanel}>
                                {CAPABILITY_GROUPS.map((capability) => (
                                    <Group
                                        key={capability.key}
                                        justify="space-between"
                                        align="flex-start"
                                        wrap="nowrap"
                                        className={classes.toolToggleRow}
                                    >
                                        <Stack gap={3}>
                                            <Text fz="xs" fw={500}>
                                                {capability.label}
                                            </Text>
                                            <Text fz={11} c="dimmed">
                                                {capability.description}
                                            </Text>
                                        </Stack>
                                        {capability.locked ? (
                                            <Tooltip label="Always on">
                                                <Box
                                                    component="span"
                                                    className={
                                                        classes.permissionSwitch
                                                    }
                                                >
                                                    <Switch
                                                        checked
                                                        disabled
                                                        size="xs"
                                                        color="ldDark"
                                                    />
                                                </Box>
                                            </Tooltip>
                                        ) : (
                                            <Switch
                                                checked={
                                                    toolSettings[
                                                        capability.key
                                                    ] ?? true
                                                }
                                                onChange={(e) =>
                                                    handleCapabilityToggle(
                                                        capability.key,
                                                        e.currentTarget.checked,
                                                    )
                                                }
                                                disabled={mutation.isLoading}
                                                size="xs"
                                                color="ldDark"
                                                className={
                                                    classes.permissionSwitch
                                                }
                                            />
                                        )}
                                    </Group>
                                ))}
                            </Stack>
                        </Stack>
                    </>
                )}
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
    const isReversed = !!action.reversedAt;

    return (
        <Table.Tr
            className={[
                classes.row,
                selected && classes.rowSelected,
                isReversed && classes.rowReversed,
            ]
                .filter(Boolean)
                .join(' ')}
            onClick={() => onSelect(action)}
        >
            <Table.Td w={100}>
                {config.tooltip ? (
                    <Tooltip label={config.tooltip} withinPortal>
                        <span className={classes.actionPill}>
                            <Box
                                className={classes.dot}
                                style={{ backgroundColor: config.dotColor }}
                            />
                            {config.label}
                        </span>
                    </Tooltip>
                ) : (
                    <span className={classes.actionPill}>
                        <Box
                            className={classes.dot}
                            style={{ backgroundColor: config.dotColor }}
                        />
                        {config.label}
                    </span>
                )}
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

// --- Run grouping ---

const VISIBLE_RUN_COUNT = 3;

type RunGroup = {
    sessionId: string;
    startedAt: string;
    actions: ManagedAgentAction[];
    counts: Partial<Record<ManagedAgentAction['actionType'], number>>;
};

const groupActionsBySession = (actions: ManagedAgentAction[]): RunGroup[] => {
    const groups = new Map<string, RunGroup>();
    for (const action of actions) {
        const existing = groups.get(action.sessionId);
        if (existing) {
            existing.actions.push(action);
            existing.counts[action.actionType] =
                (existing.counts[action.actionType] ?? 0) + 1;
            if (action.createdAt < existing.startedAt) {
                existing.startedAt = action.createdAt;
            }
        } else {
            groups.set(action.sessionId, {
                sessionId: action.sessionId,
                startedAt: action.createdAt,
                actions: [action],
                counts: { [action.actionType]: 1 },
            });
        }
    }
    return Array.from(groups.values());
};

const RunHeaderRow: FC<{
    run: RunGroup;
    isOpen: boolean;
    onToggle: () => void;
}> = ({ run, isOpen, onToggle }) => {
    const totalCount = run.actions.length;
    return (
        <Table.Tr className={classes.runHeaderRow} onClick={onToggle}>
            <Table.Td colSpan={3}>
                <Group justify="space-between" gap="xs" wrap="nowrap">
                    <Group gap="xs" wrap="nowrap">
                        <IconChevronRight
                            size={12}
                            className={
                                isOpen
                                    ? classes.runChevronOpen
                                    : classes.runChevron
                            }
                        />
                        <Text
                            fz={11}
                            fw={600}
                            tt="uppercase"
                            c="dimmed"
                            lts={0.4}
                        >
                            Run
                        </Text>
                        <Text fz="xs" c="dimmed">
                            ·
                        </Text>
                        <Tooltip
                            label={formatAbsoluteTimestamp(run.startedAt)}
                            withinPortal
                        >
                            <Text fz="xs" c="dimmed">
                                {formatTimestamp(run.startedAt)}
                            </Text>
                        </Tooltip>
                    </Group>
                    <Group gap={6} wrap="nowrap">
                        {Object.entries(run.counts).map(([type, count]) => {
                            const cfg =
                                ACTION_CONFIG[
                                    type as ManagedAgentAction['actionType']
                                ];
                            return (
                                <Tooltip
                                    key={type}
                                    label={cfg.label}
                                    withinPortal
                                >
                                    <span className={classes.runCountPill}>
                                        <Box
                                            className={classes.dot}
                                            style={{
                                                backgroundColor: cfg.dotColor,
                                            }}
                                        />
                                        {count}
                                    </span>
                                </Tooltip>
                            );
                        })}
                        <Text fz={11} c="dimmed">
                            {totalCount}{' '}
                            {totalCount === 1 ? 'action' : 'actions'}
                        </Text>
                    </Group>
                </Group>
            </Table.Td>
        </Table.Tr>
    );
};

// --- Page ---

// ts-unused-exports:disable-next-line
export const ManagedAgentActivityPage: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const queryClient = useQueryClient();
    const { user } = useApp();
    const canManageAutopilot =
        user.data?.ability?.can(
            'manage',
            subject('AiAgent', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid,
            }),
        ) ?? false;
    const { showToastSuccess, showToastError, showToastApiError } =
        useToaster();
    const { data: settings, isLoading: settingsLoading } =
        useManagedAgentSettings({ enabled: canManageAutopilot });
    const { data: latestRun } = useManagedAgentLatestRun({
        enabled: canManageAutopilot,
    });
    const isRunning = latestRun?.status === ManagedAgentRunStatus.STARTED;
    const { data: actions, isLoading } = useManagedAgentActions({
        enabled: canManageAutopilot,
        fastPoll: isRunning,
    });
    const previousRunStatus = useRef(latestRun?.status);
    useEffect(() => {
        const prev = previousRunStatus.current;
        const curr = latestRun?.status;
        if (
            prev === ManagedAgentRunStatus.STARTED &&
            curr &&
            curr !== ManagedAgentRunStatus.STARTED
        ) {
            void queryClient.invalidateQueries({
                queryKey: ['managed-agent-actions', projectUuid],
            });
            if (curr === ManagedAgentRunStatus.COMPLETED) {
                const count = latestRun?.actionCount ?? 0;
                const summarySnippet = summaryToSubtitle(latestRun?.summary);
                const countFallback =
                    count === 0
                        ? 'No actions needed'
                        : `${count} action${count === 1 ? '' : 's'} taken`;
                showToastSuccess({
                    title: 'Autopilot finished',
                    subtitle: summarySnippet ?? countFallback,
                });
            } else if (curr === ManagedAgentRunStatus.ERROR) {
                showToastError({
                    title: 'Autopilot run failed',
                    subtitle: latestRun?.error ?? 'Unknown error',
                });
            }
        }
        previousRunStatus.current = curr;
    }, [
        latestRun?.status,
        latestRun?.actionCount,
        latestRun?.error,
        latestRun?.summary,
        projectUuid,
        queryClient,
        showToastSuccess,
        showToastError,
    ]);
    const [selected, setSelected] = useState<ManagedAgentAction | null>(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [userOpenState, setUserOpenState] = useState<Map<string, boolean>>(
        new Map(),
    );
    const [defaultOpenSet, setDefaultOpenSet] = useState<Set<string>>(
        new Set(),
    );
    const [showOlderRuns, setShowOlderRuns] = useState(false);
    const runs = useMemo(() => groupActionsBySession(actions ?? []), [actions]);

    useEffect(() => {
        setDefaultOpenSet((prev) => {
            const next = new Set(prev);
            runs.slice(0, VISIBLE_RUN_COUNT).forEach((r) =>
                next.add(r.sessionId),
            );
            return next;
        });
    }, [runs]);

    const isRunOpen = useCallback(
        (sessionId: string) => {
            const userValue = userOpenState.get(sessionId);
            if (userValue !== undefined) return userValue;
            return defaultOpenSet.has(sessionId);
        },
        [userOpenState, defaultOpenSet],
    );

    const toggleRun = useCallback(
        (sessionId: string) => {
            setUserOpenState((prev) => {
                const next = new Map(prev);
                next.set(sessionId, !isRunOpen(sessionId));
                return next;
            });
        },
        [isRunOpen],
    );

    const handleSelectAction = useCallback(
        (action: ManagedAgentAction) => {
            setSettingsOpen(false);
            setSelected(action);
            const runIdx = runs.findIndex(
                (r) => r.sessionId === action.sessionId,
            );
            if (runIdx >= VISIBLE_RUN_COUNT) {
                setShowOlderRuns(true);
            }
            setUserOpenState((prev) => {
                const next = new Map(prev);
                next.set(action.sessionId, true);
                return next;
            });
        },
        [runs],
    );

    const runNowMutation = useMutation<undefined, ApiError>({
        mutationFn: () => runHeartbeat(projectUuid!),
        onSuccess: () => {
            showToastSuccess({
                title: 'Autopilot run started',
                subtitle:
                    'Project health checks are running in the background.',
            });
            void queryClient.invalidateQueries({
                queryKey: ['managed-agent-actions', projectUuid],
            });
            void queryClient.invalidateQueries({
                queryKey: ['managed-agent-latest-run', projectUuid],
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to start Autopilot',
                apiError: error,
            });
        },
    });

    if (!canManageAutopilot) {
        return <ForbiddenPanel />;
    }

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
                    defaultSize={selected || settingsOpen ? 65 : 100}
                    minSize={40}
                >
                    <Box className={classes.page}>
                        <Stack gap="lg">
                            <SetupSection
                                enabled={settings?.enabled ?? false}
                                schedule={
                                    settings?.schedule ??
                                    ManagedAgentScheduleOption.DAILY
                                }
                                settingsOpen={settingsOpen}
                                isRunNowLoading={runNowMutation.isLoading}
                                isRunning={isRunning}
                                onRunNow={() => runNowMutation.mutate()}
                                onOpenSettings={() => {
                                    setSelected(null);
                                    setSettingsOpen(true);
                                }}
                            />

                            {runs.length === 0 ? (
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
                                                <Table.Th w={140}>
                                                    Action
                                                </Table.Th>
                                                <Table.Th w={260}>
                                                    Name
                                                </Table.Th>
                                                <Table.Th>Message</Table.Th>
                                            </Table.Tr>
                                        </Table.Thead>
                                        {runs.map((run, idx) => {
                                            const isOlder =
                                                idx >= VISIBLE_RUN_COUNT;
                                            if (isOlder && !showOlderRuns)
                                                return null;
                                            const open = isRunOpen(
                                                run.sessionId,
                                            );
                                            return (
                                                <Table.Tbody
                                                    key={run.sessionId}
                                                >
                                                    <RunHeaderRow
                                                        run={run}
                                                        isOpen={open}
                                                        onToggle={() =>
                                                            toggleRun(
                                                                run.sessionId,
                                                            )
                                                        }
                                                    />
                                                    {open &&
                                                        run.actions.map(
                                                            (action) => (
                                                                <ActionRow
                                                                    key={
                                                                        action.actionUuid
                                                                    }
                                                                    action={
                                                                        action
                                                                    }
                                                                    selected={
                                                                        selected?.actionUuid ===
                                                                        action.actionUuid
                                                                    }
                                                                    onSelect={
                                                                        handleSelectAction
                                                                    }
                                                                />
                                                            ),
                                                        )}
                                                </Table.Tbody>
                                            );
                                        })}
                                        {!showOlderRuns &&
                                            runs.length > VISIBLE_RUN_COUNT && (
                                                <Table.Tbody>
                                                    <Table.Tr
                                                        className={
                                                            classes.showMoreRow
                                                        }
                                                    >
                                                        <Table.Td colSpan={3}>
                                                            <UnstyledButton
                                                                className={
                                                                    classes.showMoreButton
                                                                }
                                                                onClick={() =>
                                                                    setShowOlderRuns(
                                                                        true,
                                                                    )
                                                                }
                                                            >
                                                                Show{' '}
                                                                {runs.length -
                                                                    VISIBLE_RUN_COUNT}{' '}
                                                                older{' '}
                                                                {runs.length -
                                                                    VISIBLE_RUN_COUNT ===
                                                                1
                                                                    ? 'run'
                                                                    : 'runs'}
                                                            </UnstyledButton>
                                                        </Table.Td>
                                                    </Table.Tr>
                                                </Table.Tbody>
                                            )}
                                    </Table>
                                </Box>
                            )}
                        </Stack>
                    </Box>
                </Panel>

                {(selected || settingsOpen) && (
                    <>
                        <PanelResizeHandle className={classes.resizeHandle} />
                        <Panel
                            id={
                                selected ? 'detail-sidebar' : 'settings-sidebar'
                            }
                            defaultSize={35}
                            minSize={25}
                            maxSize={50}
                        >
                            {selected ? (
                                <DetailSidebar
                                    action={selected}
                                    onClose={() => setSelected(null)}
                                />
                            ) : (
                                <SettingsSidebar
                                    projectUuid={projectUuid!}
                                    enabled={settings?.enabled ?? false}
                                    schedule={
                                        settings?.schedule ??
                                        ManagedAgentScheduleOption.DAILY
                                    }
                                    slackChannelId={
                                        settings?.slackChannelId ?? null
                                    }
                                    toolSettings={settings?.toolSettings ?? {}}
                                    isLoading={settingsLoading}
                                    onClose={() => setSettingsOpen(false)}
                                />
                            )}
                        </Panel>
                    </>
                )}
            </PanelGroup>
        </Stack>
    );
};
