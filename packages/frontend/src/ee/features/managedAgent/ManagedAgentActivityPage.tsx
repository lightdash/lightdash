import { subject } from '@casl/ability';
import {
    type ApiError,
    type ContentVerificationInfo,
    countTotalFilterRules,
    type Dashboard,
    DEFAULT_MANAGED_AGENT_POLICY,
    getFixedBrokenMetadata,
    getManagedAgentActionCategory,
    type ManagedAgentAction,
    ManagedAgentActionType,
    type ManagedAgentPolicy,
    type ManagedAgentRun,
    ManagedAgentRunStatus,
    ManagedAgentScheduleOption,
    ManagedAgentTargetType,
    type UpdateManagedAgentPolicy,
    type UpdateManagedAgentSpaceScope,
    type Project,
    type SavedChart,
    type UpdatedByUser,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Box,
    Button,
    Divider,
    Group,
    Loader,
    Menu,
    MultiSelect,
    Select,
    Stack,
    Switch,
    Table,
    Text,
    TextInput,
    Title,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { useDebouncedValue, useDisclosure } from '@mantine/hooks';
import {
    IconAdjustments,
    IconAlertTriangle,
    IconArrowBackUp,
    IconBrandSlack,
    IconCalendar,
    IconChartBar,
    IconCheck,
    IconChevronDown,
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
    IconSearch,
    IconSettings,
    IconTarget,
    IconTool,
    IconTrash,
    IconX,
} from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { type TFunction } from 'i18next';
import {
    Fragment,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { lightdashApi } from '../../../api';
import { AiMarkdown } from '../../../components/common/AiMarkdown';
import { CategoryBadge } from '../../../components/common/CategoryBadge';
import CalendarRangePicker from '../../../components/common/DatePickers/CalendarRangePicker';
import { type CalendarDateRange } from '../../../components/common/DatePickers/types';
import MantineIcon from '../../../components/common/MantineIcon';
import { NumberInput } from '../../../components/common/NumberInput';
import { NAVBAR_HEIGHT } from '../../../components/common/Page/constants';
import InfoRow from '../../../components/common/PageHeader/InfoRow';
import ResizableSplitter from '../../../components/common/ResizableSplitter';
import { SlackChannelSelect } from '../../../components/common/SlackChannelSelect';
import TruncatedText from '../../../components/common/TruncatedText';
import ForbiddenPanel from '../../../components/ForbiddenPanel';
import { useChartViewStats } from '../../../hooks/chart/useChartViewStats';
import { useDashboardQuery } from '../../../hooks/dashboard/useDashboard';
import { useGetSlack } from '../../../hooks/slack/useSlack';
import useToaster from '../../../hooks/toaster/useToaster';
import { useProject } from '../../../hooks/useProject';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useChartVersion, useSavedQuery } from '../../../hooks/useSavedQuery';
import { useSpaceSummaries } from '../../../hooks/useSpaces';
import useApp from '../../../providers/App/useApp';
import {
    useManagedAgentActions,
    type ManagedAgentActionQueryFilters,
} from './hooks/useManagedAgentActions';
import { useManagedAgentLatestRun } from './hooks/useManagedAgentLatestRun';
import { useManagedAgentRuns } from './hooks/useManagedAgentRuns';
import {
    hasManagedAgentRuntimeAlert,
    useManagedAgentRuntime,
} from './hooks/useManagedAgentRuntime';
import { useManagedAgentSettings } from './hooks/useManagedAgentSettings';
import classes from './ManagedAgentActivityPage.module.css';
import { ManagedAgentRunSummary } from './ManagedAgentRunSummary';
import { ManagedAgentRuntimeAlerts } from './ManagedAgentRuntimeDetails';
import { SuggestionsSpaceAccess } from './SuggestionsSpaceAccess';
import { ToolActivityBadge } from './ToolActivityBadge';
import { toPlainPreview } from './utils/runSummaryMarkdown';

const reverseAction = async (
    projectUuid: string,
    actionUuid: string,
): Promise<ManagedAgentAction> =>
    lightdashApi<ManagedAgentAction>({
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
        policy?: UpdateManagedAgentPolicy;
        spaceScope?: UpdateManagedAgentSpaceScope;
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

const getScheduleOptions = (t: TFunction) => [
    {
        value: ManagedAgentScheduleOption.EVERY_6_HOURS,
        label: t('setup.schedule.every6Hours'),
    },
    {
        value: ManagedAgentScheduleOption.EVERY_12_HOURS,
        label: t('setup.schedule.every12Hours'),
    },
    {
        value: ManagedAgentScheduleOption.DAILY,
        label: t('setup.schedule.daily'),
    },
    {
        value: ManagedAgentScheduleOption.EVERY_2_DAYS,
        label: t('setup.schedule.every2Days'),
    },
    {
        value: ManagedAgentScheduleOption.WEEKLY,
        label: t('setup.schedule.weekly'),
    },
];

const getCapabilityGroups = (t: TFunction) => [
    {
        key: 'readOnly',
        label: t('settings.capabilities.readOnly.label'),
        description: t('settings.capabilities.readOnly.description'),
        locked: true,
    },
    {
        key: 'createContent',
        label: t('settings.capabilities.createContent.label'),
        description: t('settings.capabilities.createContent.description'),
        locked: false,
    },
    {
        key: 'modifyExistingContent',
        label: t('settings.capabilities.modifyExistingContent.label'),
        description: t(
            'settings.capabilities.modifyExistingContent.description',
        ),
        locked: false,
    },
];

const getAggressionOptions = (
    t: TFunction,
): {
    value: ManagedAgentPolicy['aggression'];
    label: string;
}[] => [
    { value: 'observe', label: t('policy.aggression.observe.label') },
    { value: 'flag', label: t('policy.aggression.flag.label') },
    { value: 'cleanup', label: t('policy.aggression.cleanup.label') },
];

const PolicyNumberField: FC<{
    label: string;
    suffix: string;
    value: number;
    min: number;
    max: number;
    disabled: boolean;
    onCommit: (value: number) => void;
}> = ({ label, suffix, value, min, max, disabled, onCommit }) => {
    const [draft, setDraft] = useState<number | undefined>(value);
    return (
        <NumberInput
            label={label}
            suffix={suffix}
            size="xs"
            min={min}
            max={max}
            clampBehavior="strict"
            defaultValue={value}
            onNumberChange={setDraft}
            onBlur={() => {
                if (draft !== undefined && draft !== value) {
                    onCommit(Math.min(max, Math.max(min, draft)));
                }
            }}
            disabled={disabled}
        />
    );
};

const SetupSection: FC<{
    runtime: ReturnType<typeof useManagedAgentRuntime>;
    canManageAiSettings: boolean;
    enabled: boolean;
    schedule: ManagedAgentScheduleOption;
    settingsOpen: boolean;
    onOpenSettings: () => void;
    onRunNow: () => void;
    isRunNowLoading: boolean;
    isRunning: boolean;
}> = ({
    runtime,
    canManageAiSettings,
    enabled,
    schedule: initialSchedule,
    settingsOpen,
    onOpenSettings,
    onRunNow,
    isRunNowLoading,
    isRunning,
}) => {
    const { t } = useTranslation('managedAgent');
    const scheduleLabel =
        getScheduleOptions(t).find((o) => o.value === initialSchedule)?.label ??
        t('setup.schedule.daily');

    return (
        <Stack gap={0}>
            <Group justify="space-between" align="center" pb="md">
                <Group gap="sm" align="center" wrap="nowrap">
                    <Box
                        className={classes.setupOrb}
                        data-state={enabled ? 'active' : 'disabled'}
                    >
                        <IconTarget size={22} stroke={2} />
                    </Box>
                    <Stack gap={2}>
                        <Group gap="sm" align="center">
                            <Title order={2}>{t('homeCard.title')}</Title>
                            <Box className={classes.activeBadge}>
                                <Box
                                    className={
                                        isRunning
                                            ? classes.runningDotInline
                                            : enabled
                                              ? classes.activeDotInline
                                              : classes.disabledDotInline
                                    }
                                />
                                {isRunning
                                    ? t('header.status.running')
                                    : enabled
                                      ? t('homeCard.activeSchedule', {
                                            schedule: scheduleLabel,
                                        })
                                      : t('header.status.disabled')}
                            </Box>
                        </Group>
                        <Text fz="sm" c="dimmed">
                            {t('header.tagline')}
                            {canManageAiSettings && (
                                <>
                                    {' · '}
                                    <Anchor
                                        component={Link}
                                        to="/generalSettings/ai/general"
                                        target="_blank"
                                        fz="sm"
                                        fw={600}
                                        c="dimmed"
                                        className={classes.aiSettingsLink}
                                    >
                                        {t('runtime.aiSettings')}
                                        <MantineIcon
                                            icon={IconExternalLink}
                                            size={14}
                                        />
                                    </Anchor>
                                </>
                            )}
                        </Text>
                    </Stack>
                </Group>
                <Group gap="xs">
                    <Tooltip
                        label={
                            isRunning
                                ? t('header.runTooltip.running')
                                : enabled
                                  ? t('header.runTooltip.runNow')
                                  : t('header.runTooltip.enableToRun')
                        }
                    >
                        <ActionIcon
                            aria-label={t('header.runTooltip.runNow')}
                            variant="default"
                            size="lg"
                            onClick={onRunNow}
                            disabled={!enabled || isRunNowLoading || isRunning}
                            loading={isRunNowLoading || isRunning}
                        >
                            <MantineIcon icon={IconPlayerPlay} size="sm" />
                        </ActionIcon>
                    </Tooltip>
                    <Button
                        variant={settingsOpen ? 'light' : 'default'}
                        size="sm"
                        leftSection={
                            <MantineIcon icon={IconSettings} size={14} />
                        }
                        onClick={onOpenSettings}
                    >
                        {t('header.settings')}
                    </Button>
                </Group>
            </Group>
            {hasManagedAgentRuntimeAlert(runtime) && (
                <Box pb="md">
                    <ManagedAgentRuntimeAlerts runtime={runtime} />
                </Box>
            )}
            <Box className={classes.headerDivider} />
        </Stack>
    );
};

const ACTION_DOT_COLORS: Record<ManagedAgentAction['actionType'], string> = {
    flagged_stale: 'var(--mantine-color-orange-5)',
    soft_deleted: 'var(--mantine-color-red-5)',
    flagged_broken: 'var(--mantine-color-red-5)',
    flagged_slow: 'var(--mantine-color-yellow-6)',
    fixed_broken: 'var(--mantine-color-teal-5)',
    created_content: 'var(--mantine-color-blue-5)',
    insight: 'var(--mantine-color-violet-5)',
    blocked: 'var(--mantine-color-ldGray-6)',
};

const ACTION_TYPES_WITH_TOOLTIP: ReadonlySet<ManagedAgentAction['actionType']> =
    new Set([
        ManagedAgentActionType.FLAGGED_STALE,
        ManagedAgentActionType.FLAGGED_BROKEN,
        ManagedAgentActionType.FLAGGED_SLOW,
        ManagedAgentActionType.BLOCKED,
    ]);

const getActionConfig = (
    t: TFunction,
    actionType: ManagedAgentAction['actionType'],
): { label: string; dotColor: string; tooltip?: string } => ({
    label: t(`actionTypes.${actionType}.label`),
    dotColor: ACTION_DOT_COLORS[actionType],
    tooltip: ACTION_TYPES_WITH_TOOLTIP.has(actionType)
        ? t(`actionTypes.${actionType}.tooltip`)
        : undefined,
});

const revertActionLabel = (
    t: TFunction,
    category: ReturnType<typeof getManagedAgentActionCategory>,
    isReversed: boolean,
): string => {
    if (category === 'undo') {
        return isReversed
            ? t('actions.alreadyUndone')
            : t('actions.undoAction');
    }
    return isReversed ? t('actions.alreadyDismissed') : t('actions.dismiss');
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
    <Text fz="sm" fw={500}>
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
                        fz="xs"
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
    const { t } = useTranslation('managedAgent');
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
            <MetadataLabel label={t('details.chartInfo')} />
            <Group gap="lg">
                {chartType && (
                    <Stack gap={2}>
                        <Text fz="xs" c="dimmed">
                            {t('details.type')}
                        </Text>
                        <Text fz="xs" fw={500}>
                            {chartType}
                        </Text>
                    </Stack>
                )}
                {exploreName && (
                    <Stack gap={2}>
                        <Text fz="xs" c="dimmed">
                            {t('details.explore')}
                        </Text>
                        <Text fz="xs" fw={500}>
                            {exploreName}
                        </Text>
                    </Stack>
                )}
            </Group>
            <MetadataFieldList
                label={t('details.dimensions')}
                fields={dimensions}
            />
            <MetadataFieldList label={t('details.metrics')} fields={metrics} />
        </Stack>
    );
};

const BrokenDetails: FC<{ metadata: Record<string, unknown> }> = ({
    metadata,
}) => {
    const { t } = useTranslation('managedAgent');
    const error = metadata.error as string | undefined;
    const errorType = metadata.error_type as string | undefined;
    const source = metadata.source as string | undefined;
    if (!error && !errorType && !source) return null;

    const hasRows = !!errorType || !!source;

    return (
        <Stack gap="sm">
            <MetadataLabel label={t('details.validationError')} />
            {hasRows && (
                <Stack gap={10}>
                    {errorType && (
                        <InfoRow
                            icon={IconAlertTriangle}
                            label={t('details.type')}
                        >
                            {errorType}
                        </InfoRow>
                    )}
                    {source && (
                        <InfoRow icon={IconHash} label={t('details.source')}>
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
    const { t } = useTranslation('managedAgent');
    const execMs = metadata.execution_time_ms as number | undefined;
    const context = metadata.context as string | undefined;
    if (execMs === undefined) return null;

    return (
        <Stack gap="sm">
            <MetadataLabel label={t('details.performance')} />
            <Stack gap={10}>
                <InfoRow icon={IconClock} label={t('details.executionTime')}>
                    {t('details.seconds', {
                        value: (execMs / 1000).toFixed(1),
                    })}
                </InfoRow>
                {context && (
                    <InfoRow icon={IconHash} label={t('details.context')}>
                        {context}
                    </InfoRow>
                )}
            </Stack>
        </Stack>
    );
};

type FieldDiff = {
    label: string;
    added: string[];
    removed: string[];
};

const computeFieldDiff = (
    label: string,
    previous: readonly string[],
    current: readonly string[],
): FieldDiff => {
    const previousSet = new Set(previous);
    const currentSet = new Set(current);
    return {
        label,
        added: current.filter((f) => !previousSet.has(f)),
        removed: previous.filter((f) => !currentSet.has(f)),
    };
};

const FieldDiffRow: FC<{ diff: FieldDiff }> = ({ diff }) => {
    if (diff.added.length === 0 && diff.removed.length === 0) return null;
    return (
        <Stack gap={4}>
            <MetadataLabel label={diff.label} />
            <Group gap={4}>
                {diff.removed.map((f) => (
                    <Text
                        key={`removed-${f}`}
                        fz="xs"
                        ff="monospace"
                        className={classes.fieldPillRemoved}
                    >
                        {f}
                    </Text>
                ))}
                {diff.added.map((f) => (
                    <Text
                        key={`added-${f}`}
                        fz="xs"
                        ff="monospace"
                        className={classes.fieldPillAdded}
                    >
                        {f}
                    </Text>
                ))}
            </Group>
        </Stack>
    );
};

const FixedBrokenDiff: FC<{
    previousChart: SavedChart | undefined;
    currentChart: SavedChart | undefined;
    historyHref: string;
}> = ({ previousChart, currentChart, historyHref }) => {
    const { t } = useTranslation('managedAgent');
    const historyLink = (
        <Anchor href={historyHref} target="_blank" rel="noreferrer" fz="xs">
            {t('details.viewChartHistory')}
        </Anchor>
    );

    if (!previousChart || !currentChart) {
        return (
            <Stack gap="sm">
                <MetadataLabel label={t('details.changesApplied')} />
                <Text fz="xs" c="dimmed" lh={1.6}>
                    {t('details.diffUnavailable')}
                </Text>
                {historyLink}
            </Stack>
        );
    }

    const dimensionsDiff = computeFieldDiff(
        t('details.dimensions'),
        previousChart.metricQuery.dimensions,
        currentChart.metricQuery.dimensions,
    );
    const metricsDiff = computeFieldDiff(
        t('details.metrics'),
        previousChart.metricQuery.metrics,
        currentChart.metricQuery.metrics,
    );
    const tableCalcsDiff = computeFieldDiff(
        t('details.tableCalculations'),
        previousChart.metricQuery.tableCalculations.map((tc) => tc.name),
        currentChart.metricQuery.tableCalculations.map((tc) => tc.name),
    );

    const previousExplore = previousChart.metricQuery.exploreName;
    const currentExplore = currentChart.metricQuery.exploreName;
    const exploreChanged = previousExplore !== currentExplore;

    const previousType = previousChart.chartConfig.type;
    const currentType = currentChart.chartConfig.type;
    const typeChanged = previousType !== currentType;

    const previousFilterCount = countTotalFilterRules(
        previousChart.metricQuery.filters,
    );
    const currentFilterCount = countTotalFilterRules(
        currentChart.metricQuery.filters,
    );
    const filtersChanged = previousFilterCount !== currentFilterCount;

    const hasFieldDiffs =
        dimensionsDiff.added.length + dimensionsDiff.removed.length > 0 ||
        metricsDiff.added.length + metricsDiff.removed.length > 0 ||
        tableCalcsDiff.added.length + tableCalcsDiff.removed.length > 0;
    const hasMeaningfulDiff =
        hasFieldDiffs || exploreChanged || typeChanged || filtersChanged;

    return (
        <Stack gap="sm">
            <MetadataLabel label={t('details.changesApplied')} />
            {hasMeaningfulDiff ? (
                <Stack gap={10}>
                    <FieldDiffRow diff={dimensionsDiff} />
                    <FieldDiffRow diff={metricsDiff} />
                    <FieldDiffRow diff={tableCalcsDiff} />
                    {exploreChanged && (
                        <InfoRow
                            icon={IconDatabase}
                            label={t('details.explore')}
                        >
                            <Text fz="xs" component="span">
                                {previousExplore} → {currentExplore}
                            </Text>
                        </InfoRow>
                    )}
                    {typeChanged && (
                        <InfoRow
                            icon={IconChartBar}
                            label={t('details.chartType')}
                        >
                            <Text fz="xs" component="span">
                                {previousType} → {currentType}
                            </Text>
                        </InfoRow>
                    )}
                    {filtersChanged && (
                        <InfoRow icon={IconHash} label={t('details.filters')}>
                            {previousFilterCount} → {currentFilterCount}
                        </InfoRow>
                    )}
                </Stack>
            ) : (
                <Text fz="xs" c="dimmed" lh={1.6}>
                    {t('details.fieldsNotSurfaced')}
                </Text>
            )}
            {historyLink}
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
    const { t } = useTranslation('managedAgent');
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
                    <InfoRow icon={IconFolder} label={t('details.space')}>
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
                    <InfoRow icon={IconClock} label={t('details.lastModified')}>
                        <Tooltip
                            label={formatAbsoluteTimestamp(
                                new Date(context.updatedAt).toISOString(),
                            )}
                        >
                            <span>
                                {lastUpdatedBy
                                    ? t('details.modifiedBy', {
                                          time: formatDistanceToNowStrict(
                                              new Date(context.updatedAt),
                                              { addSuffix: true },
                                          ),
                                          name: lastUpdatedBy,
                                      })
                                    : formatDistanceToNowStrict(
                                          new Date(context.updatedAt),
                                          { addSuffix: true },
                                      )}
                            </span>
                        </Tooltip>
                    </InfoRow>
                )}
                {typeof context.views === 'number' && (
                    <InfoRow icon={IconEye} label={t('details.totalViews')}>
                        {context.views.toLocaleString()}
                    </InfoRow>
                )}
                {verifiedBy && (
                    <InfoRow
                        icon={IconCircleCheck}
                        label={t('details.verified')}
                    >
                        {t('details.verifiedBy', { name: verifiedBy })}
                    </InfoRow>
                )}
                {context.deletedAt && (
                    <InfoRow icon={IconTrash} label={t('details.deleted')}>
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
    const { t } = useTranslation('managedAgent');
    const projectLink = `/projects/${project.projectUuid}`;
    const upstreamProjectLink = upstreamProject
        ? `/projects/${upstreamProject.projectUuid}`
        : null;
    const branch = getProjectBranch(project);
    const isPreviewProject = !!project.upstreamProjectUuid;

    return (
        <Stack gap="sm">
            <MetadataLabel label={t('details.projectMetadata')} />
            <Stack gap={10}>
                <InfoRow icon={IconDatabase} label={t('details.project')}>
                    <Anchor href={projectLink} fz="xs" fw={500}>
                        {project.name}
                    </Anchor>
                </InfoRow>
                <InfoRow icon={IconHash} label={t('details.type')}>
                    {isPreviewProject
                        ? t('details.previewProject')
                        : t('details.project')}
                </InfoRow>
                {upstreamProject && (
                    <InfoRow
                        icon={IconExternalLink}
                        label={t('details.upstreamProject')}
                    >
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
                    <InfoRow icon={IconHash} label={t('details.branch')}>
                        {branch}
                    </InfoRow>
                )}
                {createdAt && (
                    <InfoRow icon={IconClock} label={t('details.created')}>
                        <Tooltip label={formatAbsoluteTimestamp(createdAt)}>
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
    const { t } = useTranslation('managedAgent');
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    const revertMutation = useMutation<ManagedAgentAction, ApiError>({
        mutationFn: () => reverseAction(action.projectUuid, action.actionUuid),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: ['managed-agent-actions', action.projectUuid],
            });
        },
        onError: ({ error }) => {
            const isHardDeleted =
                showRestoreBanner && error?.statusCode === 404;
            showToastApiError({
                title: isHardDeleted
                    ? t('details.errors.restorePermanentlyDeleted')
                    : category === 'undo'
                      ? t('details.errors.undoFailed')
                      : t('details.errors.dismissFailed'),
                apiError: error,
            });
        },
    });

    // The parent stores `selected` as a reference to one item from the actions
    // list and doesn't re-derive when that list refetches — so the prop here
    // can be stale immediately after a successful revert. Prefer the
    // mutation's response (the authoritative post-revert action) when present.
    // The DetailSidebar gets a `key={action.actionUuid}` from the parent so
    // mutation state resets cleanly when the user picks a different action.
    const liveAction: ManagedAgentAction = revertMutation.data ?? action;
    const config = getActionConfig(t, liveAction.actionType);
    const isReversed = !!liveAction.reversedAt;
    const isProjectTarget = liveAction.targetType === 'project';
    const category = getManagedAgentActionCategory(liveAction.actionType);

    // Target is currently soft-deleted in two cases:
    // 1. Autopilot soft-deleted it and the action hasn't been undone yet.
    // 2. Autopilot created it and an admin clicked Undo (which soft-deletes
    //    the agent-created chart via reverseAction).
    // In both cases, fetching the chart/dashboard 404s and the "Open" link
    // would lead to a deleted-resource page.
    const isTargetDeleted =
        (liveAction.actionType === ManagedAgentActionType.SOFT_DELETED &&
            !isReversed) ||
        (liveAction.actionType === ManagedAgentActionType.CREATED_CONTENT &&
            isReversed);
    const showRestoreBanner =
        liveAction.actionType === ManagedAgentActionType.SOFT_DELETED &&
        !isReversed;
    const isFixedBroken =
        liveAction.actionType === ManagedAgentActionType.FIXED_BROKEN;
    const previousVersionUuid = isFixedBroken
        ? (getFixedBrokenMetadata(liveAction.metadata)?.previousVersionUuid ??
          null)
        : null;
    const showFixedBanner = isFixedBroken && !isReversed;

    const targetLink = isTargetDeleted
        ? null
        : isProjectTarget
          ? `/projects/${action.targetUuid}`
          : action.targetType === 'chart'
            ? `/projects/${action.projectUuid}/saved/${action.targetUuid}`
            : action.targetType === 'dashboard'
              ? `/projects/${action.projectUuid}/dashboards/${action.targetUuid}`
              : null;

    const TargetIcon = TARGET_ICON[action.targetType];

    // Skip the chart/dashboard fetch when the target is currently deleted —
    // the action row already carries `target_name` + `description` captured at
    // action time, which is the truth about what was deleted.
    const { data: savedChart } = useSavedQuery({
        uuidOrSlug:
            !isTargetDeleted && action.targetType === 'chart'
                ? action.targetUuid
                : undefined,
        projectUuid: action.projectUuid,
    });
    const { data: dashboard } = useDashboardQuery({
        uuidOrSlug:
            !isTargetDeleted && action.targetType === 'dashboard'
                ? action.targetUuid
                : undefined,
        projectUuid: action.projectUuid,
        useQueryOptions: {
            onError: () => undefined,
        },
    });
    const { data: chartViewStats } = useChartViewStats(
        action.targetType === 'chart' ? action.targetUuid : undefined,
    );
    const { data: previousChartVersion } = useChartVersion(
        showFixedBanner && previousVersionUuid ? action.targetUuid : undefined,
        showFixedBanner && previousVersionUuid
            ? previousVersionUuid
            : undefined,
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
            ? t('details.dashboardContext')
            : t('details.chartContext');

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

    const reversedPrefix = category === 'undo' ? 'undone' : 'dismissed';
    const reversedLabel = action.reversedAt
        ? action.reversedByUser
            ? t(`details.reversed.${reversedPrefix}By`, {
                  time: formatDistanceToNowStrict(new Date(action.reversedAt)),
                  name: `${action.reversedByUser.firstName} ${action.reversedByUser.lastName}`,
              })
            : t(`details.reversed.${reversedPrefix}`, {
                  time: formatDistanceToNowStrict(new Date(action.reversedAt)),
              })
        : null;

    return (
        <Stack gap={0} h="100%" className={classes.sidebar}>
            {/* Header */}
            <Stack gap={2} className={classes.sidebarHeader}>
                <Group justify="space-between" align="center">
                    <CategoryBadge
                        variant="dot"
                        bordered={false}
                        label={config.label}
                        color={config.dotColor}
                        tooltip={config.tooltip}
                    />
                    <Group gap={2}>
                        <Menu position="bottom-end">
                            <Menu.Target>
                                <UnstyledButton className={classes.closeBtn}>
                                    <MantineIcon icon={IconDots} size={14} />
                                </UnstyledButton>
                            </Menu.Target>
                            <Menu.Dropdown>
                                <Menu.Item
                                    leftSection={
                                        <MantineIcon
                                            icon={IconArrowBackUp}
                                            size={14}
                                        />
                                    }
                                    disabled={
                                        isReversed || revertMutation.isLoading
                                    }
                                    onClick={() => revertMutation.mutate()}
                                    color={isReversed ? undefined : 'red'}
                                >
                                    {revertActionLabel(t, category, isReversed)}
                                </Menu.Item>
                            </Menu.Dropdown>
                        </Menu>
                        <UnstyledButton
                            onClick={onClose}
                            className={classes.closeBtn}
                        >
                            <MantineIcon icon={IconX} size={14} />
                        </UnstyledButton>
                    </Group>
                </Group>
                <Group gap={6} wrap="nowrap">
                    <MantineIcon
                        icon={TargetIcon}
                        size={16}
                        color="dimmed"
                        className={classes.targetIcon}
                    />
                    <TruncatedText maxWidth={280} fz="md" fw={600}>
                        {action.targetName}
                    </TruncatedText>
                    {targetLink && (
                        <Tooltip label={t(`details.open.${action.targetType}`)}>
                            <ActionIcon
                                component="a"
                                href={targetLink}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={t(
                                    `details.open.${action.targetType}`,
                                )}
                                size="sm"
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
                        {reversedLabel}
                    </Text>
                </Group>
            )}

            {showRestoreBanner && (
                <Group
                    gap={8}
                    className={classes.deletedBanner}
                    justify="space-between"
                    wrap="nowrap"
                >
                    <Group gap={6} wrap="nowrap">
                        <MantineIcon
                            icon={IconTrash}
                            size="sm"
                            color="var(--mantine-color-red-6)"
                        />
                        <Text fz="xs" c="dimmed">
                            {t('details.deletedByAutopilot')}
                        </Text>
                    </Group>
                    <Button
                        size="xs"
                        variant="default"
                        leftSection={
                            <MantineIcon icon={IconArrowBackUp} size={14} />
                        }
                        loading={revertMutation.isLoading}
                        onClick={() => revertMutation.mutate()}
                    >
                        {t('details.restore')}
                    </Button>
                </Group>
            )}

            {showFixedBanner && (
                <Group
                    gap={8}
                    className={classes.fixedBanner}
                    justify="space-between"
                    wrap="nowrap"
                >
                    <Group gap={6} wrap="nowrap">
                        <MantineIcon
                            icon={IconTool}
                            size="sm"
                            color="var(--mantine-color-teal-6)"
                        />
                        <Text fz="xs" c="dimmed">
                            {t('details.autoFixedByAutopilot')}
                        </Text>
                    </Group>
                    {previousVersionUuid ? (
                        <Button
                            size="xs"
                            variant="default"
                            leftSection={
                                <MantineIcon icon={IconArrowBackUp} size={14} />
                            }
                            loading={revertMutation.isLoading}
                            onClick={() => revertMutation.mutate()}
                        >
                            {t('details.revert')}
                        </Button>
                    ) : (
                        <Tooltip label={t('details.revertUnsupported')} w={240}>
                            <Button
                                size="xs"
                                variant="default"
                                leftSection={
                                    <MantineIcon
                                        icon={IconArrowBackUp}
                                        size={14}
                                    />
                                }
                                disabled
                                data-disabled
                                onClick={(e) => e.preventDefault()}
                            >
                                {t('details.revert')}
                            </Button>
                        </Tooltip>
                    )}
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
                        <MetadataLabel label={t('details.description')} />
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
                {showFixedBanner && (
                    <FixedBrokenDiff
                        previousChart={previousChartVersion?.chart}
                        currentChart={savedChart}
                        historyHref={`/projects/${action.projectUuid}/saved/${action.targetUuid}/history`}
                    />
                )}

                {/* Divider if we showed details above */}
                {(hasChartDetails ||
                    hasBrokenDetails ||
                    hasSlowDetails ||
                    showFixedBanner ||
                    !!contentContext ||
                    hasProjectDetails) && (
                    <Box className={classes.headerDivider} />
                )}

                {/* Agent reasoning */}
                <Stack gap={4}>
                    <MetadataLabel label={t('details.agentReasoning')} />
                    <AiMarkdown className={classes.reasoningMarkdown}>
                        {action.description}
                    </AiMarkdown>
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
    policy: ManagedAgentPolicy;
    scopedSpaceUuids: string[];
    isLoading: boolean;
    onClose: () => void;
}> = ({
    projectUuid,
    enabled,
    schedule,
    slackChannelId,
    toolSettings,
    policy,
    scopedSpaceUuids,
    isLoading,
    onClose,
}) => {
    const { t } = useTranslation('managedAgent');
    const queryClient = useQueryClient();
    const { data: slackInstallation } = useGetSlack();
    const { data: spaceSummaries } = useSpaceSummaries(projectUuid, true);
    const organizationHasSlack = !!slackInstallation?.organizationUuid;
    const [slackNotificationsEnabled, setSlackNotificationsEnabled] =
        useState(!!slackChannelId);

    useEffect(() => {
        setSlackNotificationsEnabled(!!slackChannelId);
    }, [slackChannelId]);

    const { showToastApiError: showSettingsApiError } = useToaster();
    const mutation = useMutation({
        mutationFn: (body: Parameters<typeof updateSettings>[1]) =>
            updateSettings(projectUuid, body),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: ['managed-agent-settings', projectUuid],
            });
            void queryClient.invalidateQueries({
                queryKey: ['managed-agent-runtime', projectUuid],
            });
        },
        onError: ({ error }: ApiError) => {
            showSettingsApiError({
                title: t('settings.updateFailed'),
                apiError: error,
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

    const handlePolicyChange = useCallback(
        (update: UpdateManagedAgentPolicy) => {
            mutation.mutate({ policy: update });
        },
        [mutation],
    );

    // Scope edits are drafted locally and saved with one PATCH on Apply
    const [selectedSpaces, setSelectedSpaces] =
        useState<string[]>(scopedSpaceUuids);
    const [draftScopeMode, setDraftScopeMode] = useState(policy.spaceScopeMode);

    const isScopeDirty =
        draftScopeMode !== policy.spaceScopeMode ||
        selectedSpaces.length !== scopedSpaceUuids.length ||
        selectedSpaces.some((uuid) => !scopedSpaceUuids.includes(uuid));

    const handleApplySpaceScope = useCallback(() => {
        const scope: UpdateManagedAgentSpaceScope = {
            mode: draftScopeMode,
            spaceUuids: selectedSpaces,
        };
        mutation.mutate({ spaceScope: scope });
    }, [mutation, draftScopeMode, selectedSpaces]);

    const handleResetSpaceScope = useCallback(() => {
        setDraftScopeMode(policy.spaceScopeMode);
        setSelectedSpaces(scopedSpaceUuids);
    }, [policy.spaceScopeMode, scopedSpaceUuids]);

    // The caption reflects what is saved, not the draft being composed
    const spaceScopeSummary = (() => {
        const count = scopedSpaceUuids.length;
        if (policy.spaceScopeMode === 'only') {
            return t('settings.spaceScope.summaryOnly', { count });
        }
        return count === 0
            ? t('settings.spaceScope.summaryAll')
            : t('settings.spaceScope.summaryAllExcept', { count });
    })();

    return (
        <Stack gap={0} h="100%" className={classes.sidebar}>
            <Stack gap={2} className={classes.sidebarHeader}>
                <Group justify="space-between" align="center">
                    <Group gap={6}>
                        <MantineIcon
                            icon={IconSettings}
                            size={16}
                            color="dimmed"
                        />
                        <Text fz="sm" fw={600}>
                            {t('settings.title')}
                        </Text>
                    </Group>
                    <UnstyledButton
                        onClick={onClose}
                        className={classes.closeBtn}
                    >
                        <MantineIcon icon={IconX} size={14} />
                    </UnstyledButton>
                </Group>
                <Text fz="xs" c="dimmed">
                    {t('settings.subtitle')}
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
                            {t('setup.title')}
                        </Text>
                        <Text fz="xs" c="dimmed">
                            {t('settings.enableDescription')}
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
                                {t('settings.schedule')}
                            </Text>
                            <Select
                                data={getScheduleOptions(t)}
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
                                        <MantineIcon
                                            icon={IconBrandSlack}
                                            size={16}
                                            color="dimmed"
                                        />
                                        <Text fz="sm" fw={500}>
                                            {t('settings.slack.title')}
                                        </Text>
                                    </Group>
                                    <Text fz="xs" c="dimmed">
                                        {t('settings.slack.description')}
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
                                            placeholder={t(
                                                'settings.slack.searchChannels',
                                            )}
                                            size="sm"
                                            value={slackChannelId}
                                            onChange={handleSlackChannelChange}
                                        />
                                        <Text fz="xs" c="dimmed">
                                            {t('settings.slack.inviteHint')}
                                        </Text>
                                    </Stack>
                                )
                            ) : (
                                <Stack gap="xs">
                                    <Text fz="xs" c="dimmed">
                                        {t('settings.slack.connectHint')}
                                    </Text>
                                    <Button
                                        component="a"
                                        href="/generalSettings/integrations"
                                        variant="default"
                                        size="xs"
                                        leftSection={
                                            <MantineIcon
                                                icon={IconExternalLink}
                                                size={14}
                                            />
                                        }
                                    >
                                        {t('settings.slack.openIntegrations')}
                                    </Button>
                                </Stack>
                            )}
                        </Stack>

                        <Stack gap="md" className={classes.settingsRow}>
                            <Stack gap={4}>
                                <Group gap={6}>
                                    <MantineIcon
                                        icon={IconTool}
                                        size={16}
                                        color="dimmed"
                                    />
                                    <Text fz="sm" fw={500}>
                                        {t('settings.permissions.title')}
                                    </Text>
                                </Group>
                                <Text fz="xs" c="dimmed">
                                    {t('settings.permissions.description')}
                                </Text>
                            </Stack>
                            <Stack gap={0} className={classes.toolTogglePanel}>
                                {getCapabilityGroups(t).map((capability) => (
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
                                            <Text fz="xs" c="dimmed">
                                                {capability.description}
                                            </Text>
                                        </Stack>
                                        {capability.locked ? (
                                            <Tooltip
                                                label={t(
                                                    'settings.permissions.alwaysOn',
                                                )}
                                            >
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
                                <Stack
                                    gap={6}
                                    className={classes.toolToggleRow}
                                >
                                    <Text fz="xs" fw={500}>
                                        {t('settings.spaceScope.title')}
                                    </Text>
                                    <Stack gap={4}>
                                        <Select
                                            data={[
                                                {
                                                    value: 'all-except',
                                                    label: t(
                                                        'settings.spaceScope.modeAllExcept',
                                                    ),
                                                },
                                                {
                                                    value: 'only',
                                                    label: t(
                                                        'settings.spaceScope.modeOnly',
                                                    ),
                                                },
                                            ]}
                                            value={draftScopeMode}
                                            onChange={(value) => {
                                                if (value) {
                                                    setDraftScopeMode(
                                                        value as ManagedAgentPolicy['spaceScopeMode'],
                                                    );
                                                }
                                            }}
                                            size="sm"
                                            disabled={mutation.isLoading}
                                        />
                                        <MultiSelect
                                            data={(spaceSummaries ?? []).map(
                                                (space) => ({
                                                    value: space.uuid,
                                                    label: space.name,
                                                }),
                                            )}
                                            value={selectedSpaces}
                                            onChange={setSelectedSpaces}
                                            placeholder={
                                                selectedSpaces.length === 0
                                                    ? t(
                                                          'settings.spaceScope.searchSpaces',
                                                      )
                                                    : undefined
                                            }
                                            searchable
                                            clearable
                                            size="sm"
                                            disabled={mutation.isLoading}
                                        />
                                    </Stack>
                                    {isScopeDirty && (
                                        <Group gap="xs">
                                            <Button
                                                size="xs"
                                                onClick={handleApplySpaceScope}
                                                loading={mutation.isLoading}
                                            >
                                                {t('settings.spaceScope.apply')}
                                            </Button>
                                            <Button
                                                size="xs"
                                                variant="subtle"
                                                onClick={handleResetSpaceScope}
                                                disabled={mutation.isLoading}
                                            >
                                                {t('actions.cancel', {
                                                    ns: 'common',
                                                })}
                                            </Button>
                                        </Group>
                                    )}
                                    <Text fz="xs" c="dimmed">
                                        {spaceScopeSummary}{' '}
                                        {policy.spaceScopeMode === 'only'
                                            ? t('settings.spaceScope.onlyHint')
                                            : t(
                                                  'settings.spaceScope.allExceptHint',
                                              )}
                                    </Text>
                                </Stack>
                            </Stack>
                        </Stack>

                        <Stack gap="md" className={classes.settingsRow}>
                            <Stack gap={4}>
                                <Group gap={6}>
                                    <MantineIcon
                                        icon={IconAdjustments}
                                        size={16}
                                        color="dimmed"
                                    />
                                    <Text fz="sm" fw={500}>
                                        {t('policy.title')}
                                    </Text>
                                </Group>
                                <Text fz="xs" c="dimmed">
                                    {t(
                                        `policy.sectionDescription.${policy.aggression}`,
                                    )}
                                </Text>
                            </Stack>

                            <Stack gap={6}>
                                <Text fz="xs" fw={500}>
                                    {t('policy.cleanupMode')}
                                </Text>
                                <Select
                                    data={getAggressionOptions(t)}
                                    value={policy.aggression}
                                    onChange={(value) => {
                                        if (value) {
                                            handlePolicyChange({
                                                aggression:
                                                    value as ManagedAgentPolicy['aggression'],
                                            });
                                        }
                                    }}
                                    size="sm"
                                    disabled={mutation.isLoading}
                                />
                                <Text fz="xs" c="dimmed">
                                    {t(
                                        `policy.aggression.${policy.aggression}.description`,
                                    )}
                                </Text>
                            </Stack>

                            <Group grow align="flex-end">
                                <PolicyNumberField
                                    key={`chart-${policy.stalenessChartDays}`}
                                    label={t('policy.staleChartsAfter')}
                                    suffix={t('policy.suffix.days')}
                                    value={policy.stalenessChartDays}
                                    min={7}
                                    max={3650}
                                    disabled={mutation.isLoading}
                                    onCommit={(value) =>
                                        handlePolicyChange({
                                            stalenessChartDays: value,
                                        })
                                    }
                                />
                                <PolicyNumberField
                                    key={`dash-${policy.stalenessDashboardDays}`}
                                    label={t('policy.staleDashboardsAfter')}
                                    suffix={t('policy.suffix.days')}
                                    value={policy.stalenessDashboardDays}
                                    min={7}
                                    max={3650}
                                    disabled={mutation.isLoading}
                                    onCommit={(value) =>
                                        handlePolicyChange({
                                            stalenessDashboardDays: value,
                                        })
                                    }
                                />
                            </Group>

                            <Group grow align="flex-end">
                                <PolicyNumberField
                                    key={`protect-${policy.protectRecentDays}`}
                                    label={t(
                                        `policy.protectRecent.${policy.aggression}`,
                                    )}
                                    suffix={t('policy.suffix.days')}
                                    value={policy.protectRecentDays}
                                    min={0}
                                    max={365}
                                    disabled={mutation.isLoading}
                                    onCommit={(value) =>
                                        handlePolicyChange({
                                            protectRecentDays: value,
                                        })
                                    }
                                />
                                <PolicyNumberField
                                    key={`preview-${policy.previewProjectDays}`}
                                    label={t('policy.oldPreviewsAfter')}
                                    suffix={t('policy.suffix.days')}
                                    value={policy.previewProjectDays}
                                    min={7}
                                    max={3650}
                                    disabled={mutation.isLoading}
                                    onCommit={(value) =>
                                        handlePolicyChange({
                                            previewProjectDays: value,
                                        })
                                    }
                                />
                            </Group>

                            <Group grow align="flex-end">
                                {policy.aggression === 'cleanup' && (
                                    <PolicyNumberField
                                        key={`escalation-${policy.escalationHours}`}
                                        label={t('policy.flagBeforeDelete')}
                                        suffix={t('policy.suffix.hours')}
                                        value={policy.escalationHours}
                                        min={0}
                                        max={720}
                                        disabled={mutation.isLoading}
                                        onCommit={(value) =>
                                            handlePolicyChange({
                                                escalationHours: value,
                                            })
                                        }
                                    />
                                )}
                                <PolicyNumberField
                                    key={`slow-${policy.slowQueryThresholdMs}`}
                                    label={t('policy.slowQueryThreshold')}
                                    suffix={t('policy.suffix.ms')}
                                    value={policy.slowQueryThresholdMs}
                                    min={100}
                                    max={600000}
                                    disabled={mutation.isLoading}
                                    onCommit={(value) =>
                                        handlePolicyChange({
                                            slowQueryThresholdMs: value,
                                        })
                                    }
                                />
                            </Group>

                            <SuggestionsSpaceAccess
                                projectUuid={projectUuid}
                                audience={policy.audience}
                                disabled={mutation.isLoading}
                                onAudienceChange={(audience) =>
                                    handlePolicyChange({ audience })
                                }
                            />

                            <Group
                                justify="space-between"
                                align="flex-start"
                                wrap="nowrap"
                            >
                                <Stack gap={3}>
                                    <Text fz="xs" fw={500}>
                                        {t('policy.protectVerified.title')}
                                    </Text>
                                    <Text fz="xs" c="dimmed">
                                        {t(
                                            'policy.protectVerified.description',
                                        )}
                                    </Text>
                                </Stack>
                                <Switch
                                    checked={
                                        policy.verifiedContent === 'protected'
                                    }
                                    onChange={(e) =>
                                        handlePolicyChange({
                                            verifiedContent: e.currentTarget
                                                .checked
                                                ? 'protected'
                                                : 'none',
                                        })
                                    }
                                    disabled={mutation.isLoading}
                                    size="xs"
                                    color="ldDark"
                                />
                            </Group>
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
    const { t } = useTranslation('managedAgent');
    const config = getActionConfig(t, action.actionType);
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
                <CategoryBadge
                    variant="dot"
                    bordered={false}
                    label={config.label}
                    color={config.dotColor}
                    tooltip={config.tooltip}
                    className={classes.actionPill}
                />
            </Table.Td>
            <Table.Td w={300}>
                <Group gap={6} wrap="nowrap">
                    <MantineIcon
                        icon={TargetIcon}
                        size={14}
                        color="dimmed"
                        className={classes.targetIcon}
                    />
                    <TruncatedText maxWidth={270} fz="sm" fw={500}>
                        {action.targetName}
                    </TruncatedText>
                </Group>
            </Table.Td>
            <Table.Td className={classes.messageCell}>
                <Text fz="xs" c="ldGray.7" lineClamp={1}>
                    {toPlainPreview(action.description)}
                </Text>
            </Table.Td>
        </Table.Tr>
    );
};

// --- Run row ---

const getTriggeredByLabel = (
    t: TFunction,
    triggeredBy: ManagedAgentRun['triggeredBy'],
) => t(`runs.triggeredBy.${triggeredBy}`);

const runVariant = (
    run: ManagedAgentRun,
): 'live' | 'completed' | 'completed-empty' | 'errored' => {
    if (run.status === ManagedAgentRunStatus.STARTED) return 'live';
    if (run.status === ManagedAgentRunStatus.ERROR) return 'errored';
    if (run.actionCount === 0) return 'completed-empty';
    return 'completed';
};

const RunHeaderRow: FC<{
    run: ManagedAgentRun;
    variant: ReturnType<typeof runVariant>;
    isOpen: boolean;
    expandable: boolean;
    onToggle: () => void;
}> = ({ run, variant, isOpen, expandable, onToggle }) => {
    const { t } = useTranslation('managedAgent');
    return (
        <Table.Tr
            className={classes.runHeaderRow}
            data-open={isOpen}
            onClick={expandable ? onToggle : undefined}
            style={expandable ? undefined : { cursor: 'default' }}
        >
            <Table.Td colSpan={3}>
                <Group justify="space-between" gap="xs" wrap="nowrap">
                    <Group gap="xs" wrap="nowrap">
                        {expandable ? (
                            <MantineIcon
                                icon={IconChevronRight}
                                size={12}
                                className={
                                    isOpen
                                        ? classes.runChevronOpen
                                        : classes.runChevron
                                }
                            />
                        ) : (
                            <Box w={12} />
                        )}
                        <Text
                            fz="sm"
                            fw={600}
                            c={isOpen ? undefined : 'ldGray.7'}
                        >
                            {t('runs.run')}
                        </Text>
                        <Text fz="xs" c="dimmed">
                            ·
                        </Text>
                        <Tooltip
                            label={formatAbsoluteTimestamp(
                                run.startedAt.toString(),
                            )}
                        >
                            <Text fz="sm" c={isOpen ? undefined : 'ldGray.7'}>
                                {formatTimestamp(run.startedAt.toString())}
                            </Text>
                        </Tooltip>
                        <Text fz="xs" c="dimmed">
                            ·
                        </Text>
                        <Text fz="sm" c={isOpen ? undefined : 'ldGray.7'}>
                            {getTriggeredByLabel(t, run.triggeredBy)}
                        </Text>
                        {variant === 'live' && (
                            <>
                                <Text fz="xs" c="dimmed">
                                    ·
                                </Text>
                                <Box className={classes.runningDotInline} />
                                <Text fz="xs" fw={500}>
                                    {t('header.status.running')}
                                </Text>
                            </>
                        )}
                        {variant === 'errored' && (
                            <>
                                <Text fz="xs" c="dimmed">
                                    ·
                                </Text>
                                <Box className={classes.failedDotInline} />
                                <Text fz="xs" fw={500} c="red.7">
                                    {t('runs.failed')}
                                </Text>
                            </>
                        )}
                    </Group>
                    <Group gap={6} wrap="nowrap">
                        {variant === 'completed-empty' ? (
                            <Text fz="xs" c="dimmed">
                                {t('runs.noActions')}
                            </Text>
                        ) : run.actionCount > 0 ? (
                            <>
                                {Object.entries(run.actionCountsByType).map(
                                    ([type, count]) => {
                                        const actionType =
                                            type as ManagedAgentAction['actionType'];
                                        const dotColor =
                                            ACTION_DOT_COLORS[actionType];
                                        if (!dotColor || !count) return null;
                                        return (
                                            <span
                                                key={type}
                                                className={classes.runCountPill}
                                            >
                                                <Box
                                                    className={classes.dot}
                                                    bg={dotColor}
                                                />
                                                {t(
                                                    `actionTypes.${actionType}.count`,
                                                    {
                                                        count,
                                                    },
                                                )}
                                            </span>
                                        );
                                    },
                                )}
                            </>
                        ) : null}
                    </Group>
                </Group>
            </Table.Td>
        </Table.Tr>
    );
};

const RunRow: FC<{
    run: ManagedAgentRun;
    isOpen: boolean;
    onToggle: () => void;
    selectedActionUuid: string | null;
    onSelectAction: (action: ManagedAgentAction) => void;
}> = ({ run, isOpen, onToggle, selectedActionUuid, onSelectAction }) => {
    const { t } = useTranslation('managedAgent');
    const variant = runVariant(run);
    const expandable = variant !== 'completed-empty' || !!run.summary;
    const isLive = variant === 'live';
    const { data: actions } = useManagedAgentActions({
        enabled: expandable && isOpen,
        fastPoll: isLive,
        runUuid: run.runUuid,
    });
    return (
        <Table.Tbody className={classes.runGroup} data-open={isOpen}>
            <RunHeaderRow
                run={run}
                variant={variant}
                isOpen={isOpen}
                expandable={expandable}
                onToggle={onToggle}
            />
            {isOpen && run.summary && (
                <Table.Tr className={classes.runSummaryRow}>
                    <Table.Td colSpan={3}>
                        <Box className={classes.runSummary}>
                            <ManagedAgentRunSummary summary={run.summary} />
                        </Box>
                    </Table.Td>
                </Table.Tr>
            )}
            {variant === 'errored' && isOpen && run.error && (
                <Table.Tr className={classes.runSummaryRow}>
                    <Table.Td colSpan={3}>
                        <Box className={classes.runSummary}>
                            <Text fz={13}>{run.error}</Text>
                        </Box>
                    </Table.Td>
                </Table.Tr>
            )}
            {expandable && isOpen && (
                <>
                    {isLive && (
                        <Table.Tr className={classes.runSummaryRow}>
                            <Table.Td colSpan={3}>
                                <Box className={classes.runSummary}>
                                    <ToolActivityBadge
                                        currentActivity={run.currentActivity}
                                    />
                                </Box>
                            </Table.Td>
                        </Table.Tr>
                    )}
                    {actions === undefined
                        ? !isLive && (
                              <Table.Tr className={classes.thinkingRow}>
                                  <Table.Td colSpan={3}>
                                      <Group gap="xs" justify="center" py="xs">
                                          <Loader
                                              size={8}
                                              type="dots"
                                              color="dark"
                                          />
                                          <Text fz="xs" c="dimmed">
                                              {t('runs.loadingActions')}
                                          </Text>
                                      </Group>
                                  </Table.Td>
                              </Table.Tr>
                          )
                        : actions.map((action) => (
                              <ActionRow
                                  key={action.actionUuid}
                                  action={action}
                                  selected={
                                      selectedActionUuid === action.actionUuid
                                  }
                                  onSelect={onSelectAction}
                              />
                          ))}
                </>
            )}
        </Table.Tbody>
    );
};

// --- Quiet runs group ---

type DisplayRow =
    | { type: 'run'; run: ManagedAgentRun }
    | { type: 'quietGroup'; groupId: string; runs: ManagedAgentRun[] };

const QuietRunsGroup: FC<{
    runs: ManagedAgentRun[];
    isOpen: boolean;
    onToggle: () => void;
}> = ({ runs, isOpen, onToggle }) => {
    const { t } = useTranslation('managedAgent');
    return (
        <Table.Tbody>
            <Table.Tr className={classes.quietGroupRow} onClick={onToggle}>
                <Table.Td colSpan={3}>
                    <Group gap="xs" wrap="nowrap">
                        <MantineIcon
                            icon={IconChevronRight}
                            size={12}
                            className={
                                isOpen
                                    ? classes.runChevronOpen
                                    : classes.runChevron
                            }
                        />
                        <Text fz="sm" c="dimmed">
                            {t('runs.quietRuns', { count: runs.length })}
                        </Text>
                    </Group>
                </Table.Td>
            </Table.Tr>
            {isOpen &&
                runs.map((run) => (
                    <Table.Tr key={run.runUuid} className={classes.quietRunRow}>
                        <Table.Td colSpan={3}>
                            <Group justify="space-between" wrap="nowrap">
                                <Group
                                    gap={8}
                                    wrap="nowrap"
                                    className={classes.quietRunMeta}
                                >
                                    <Group gap={4} wrap="nowrap">
                                        <Text fz="xs" fw={500} c="dimmed">
                                            {t('runs.run')}
                                        </Text>
                                        <Text fz="xs" c="dimmed">
                                            {t('runs.quietRunMeta', {
                                                time: formatTimestamp(
                                                    run.startedAt.toString(),
                                                ),
                                                trigger: getTriggeredByLabel(
                                                    t,
                                                    run.triggeredBy,
                                                ),
                                            })}
                                        </Text>
                                    </Group>
                                </Group>
                                <Text fz="xs" c="dimmed">
                                    {t('runs.noActions')}
                                </Text>
                            </Group>
                            {run.summary && (
                                <Box mt="xs" className={classes.runSummary}>
                                    <ManagedAgentRunSummary
                                        summary={run.summary}
                                    />
                                </Box>
                            )}
                        </Table.Td>
                    </Table.Tr>
                ))}
        </Table.Tbody>
    );
};

// --- Page ---

// ts-unused-exports:disable-next-line
// --- Action filters ---

const getActionTypeOptions = (t: TFunction) =>
    (Object.keys(ACTION_DOT_COLORS) as ManagedAgentAction['actionType'][]).map(
        (value) => ({ value, label: getActionConfig(t, value).label }),
    );

const getTargetTypeOptions = (t: TFunction) => [
    {
        value: ManagedAgentTargetType.CHART,
        label: t('filters.targetTypes.charts'),
    },
    {
        value: ManagedAgentTargetType.DASHBOARD,
        label: t('filters.targetTypes.dashboards'),
    },
    {
        value: ManagedAgentTargetType.SPACE,
        label: t('filters.targetTypes.spaces'),
    },
    {
        value: ManagedAgentTargetType.PROJECT,
        label: t('filters.targetTypes.project'),
    },
];

type ActionFiltersState = {
    search: string;
    actionTypes: ManagedAgentActionType[];
    targetTypes: ManagedAgentTargetType[];
    dateRange: CalendarDateRange;
};

const EMPTY_ACTION_FILTERS: ActionFiltersState = {
    search: '',
    actionTypes: [],
    targetTypes: [],
    dateRange: [null, null],
};

const hasActiveActionFilters = (filters: ActionFiltersState): boolean =>
    filters.search.trim() !== '' ||
    filters.actionTypes.length > 0 ||
    filters.targetTypes.length > 0 ||
    filters.dateRange[0] !== null ||
    filters.dateRange[1] !== null;

// Omnibar-style filter chip: a subtle button whose caret becomes an X that
// clears just this filter without opening the menu behind it.
const FilterChipRightSection: FC<{
    isActive: boolean;
    onClear: () => void;
}> = ({ isActive, onClear }) => {
    const { t } = useTranslation('managedAgent');
    return isActive ? (
        <Box
            component="span"
            role="button"
            aria-label={t('filters.clearFilter')}
            className={classes.filterChipClear}
            onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
            onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                e.preventDefault();
                onClear();
            }}
        >
            <MantineIcon icon={IconX} strokeWidth={1.5} />
        </Box>
    ) : (
        <MantineIcon icon={IconChevronDown} strokeWidth={1.5} />
    );
};

const filterChipProps = (isActive: boolean) =>
    ({
        size: 'compact-xs',
        variant: 'subtle',
        radius: 'md',
        className: isActive
            ? `${classes.filterChip} ${classes.filterChipActive}`
            : classes.filterChip,
    }) as const;

const FilterChipMultiSelect: FC<{
    label: string;
    options: Array<{ value: string; label: string }>;
    selected: string[];
    onChange: (selected: string[]) => void;
}> = ({ label, options, selected, onChange }) => {
    const { t } = useTranslation('managedAgent');
    const selectedLabels = options
        .filter((option) => selected.includes(option.value))
        .map((option) => option.label);
    const summary =
        selectedLabels.length === 0
            ? label
            : selectedLabels.length === 1
              ? selectedLabels[0]
              : t('filters.selectedMore', {
                    first: selectedLabels[0],
                    count: selectedLabels.length - 1,
                });

    const chipButton = (
        <Button
            rightSection={
                <FilterChipRightSection
                    isActive={selected.length > 0}
                    onClear={() => onChange([])}
                />
            }
            {...filterChipProps(selected.length > 0)}
        >
            {summary}
        </Button>
    );

    return (
        <Menu position="bottom-start" closeOnItemClick={false}>
            <Menu.Target>
                {selectedLabels.length > 1 ? (
                    <Tooltip label={selectedLabels.join(', ')}>
                        {chipButton}
                    </Tooltip>
                ) : (
                    chipButton
                )}
            </Menu.Target>
            <Menu.Dropdown>
                {options.map((option) => {
                    const isSelected = selected.includes(option.value);
                    return (
                        <Menu.Item
                            key={option.value}
                            leftSection={
                                <MantineIcon
                                    icon={IconCheck}
                                    style={{
                                        visibility: isSelected
                                            ? 'visible'
                                            : 'hidden',
                                    }}
                                />
                            }
                            onClick={() =>
                                onChange(
                                    isSelected
                                        ? selected.filter(
                                              (value) => value !== option.value,
                                          )
                                        : [...selected, option.value],
                                )
                            }
                        >
                            {option.label}
                        </Menu.Item>
                    );
                })}
            </Menu.Dropdown>
        </Menu>
    );
};

const formatDateRangeLabel = (
    t: TFunction,
    [from, to]: CalendarDateRange,
): string => {
    const fmt = (date: Date) => format(date, 'MMM d, yyyy');
    if (from && to) {
        return from.getTime() === to.getTime()
            ? fmt(from)
            : t('filters.dateRange.between', {
                  from: format(from, 'MMM d'),
                  to: fmt(to),
              });
    }
    if (from) return t('filters.dateRange.from', { date: fmt(from) });
    if (to) return t('filters.dateRange.to', { date: fmt(to) });
    return t('filters.dateRange.label');
};

const FilterChipDateRange: FC<{
    value: CalendarDateRange;
    onChange: (value: CalendarDateRange) => void;
}> = ({ value, onChange }) => {
    const { t } = useTranslation('managedAgent');
    const [isOpen, menuHandlers] = useDisclosure(false);
    const isActive = value[0] !== null || value[1] !== null;
    return (
        <Menu
            position="bottom-start"
            opened={isOpen}
            onOpen={menuHandlers.open}
            onClose={menuHandlers.close}
        >
            <Menu.Target>
                <Button
                    leftSection={
                        <MantineIcon icon={IconCalendar} strokeWidth={1.5} />
                    }
                    rightSection={
                        <FilterChipRightSection
                            isActive={isActive}
                            onClear={() => onChange([null, null])}
                        />
                    }
                    {...filterChipProps(isActive)}
                >
                    {formatDateRangeLabel(t, value)}
                </Button>
            </Menu.Target>
            <Menu.Dropdown>
                <CalendarRangePicker
                    allowSingleDateInRange
                    maxDate={new Date()}
                    value={value}
                    onChange={(range) => {
                        onChange(range);
                        if (range[0] && range[1]) {
                            menuHandlers.close();
                        }
                    }}
                />
            </Menu.Dropdown>
        </Menu>
    );
};

const ActionFilterBar: FC<{
    filters: ActionFiltersState;
    onChange: (filters: ActionFiltersState) => void;
}> = ({ filters, onChange }) => {
    const { t } = useTranslation('managedAgent');
    const isActive = hasActiveActionFilters(filters);
    return (
        <Box className={classes.filterBar}>
            <TextInput
                className={classes.filterSearch}
                size="xs"
                placeholder={t('filters.searchActions')}
                leftSection={<MantineIcon icon={IconSearch} size={14} />}
                value={filters.search}
                onChange={(event) =>
                    onChange({ ...filters, search: event.currentTarget.value })
                }
            />
            <Divider orientation="vertical" className={classes.filterDivider} />
            <FilterChipMultiSelect
                label={t('filters.action')}
                options={getActionTypeOptions(t)}
                selected={filters.actionTypes}
                onChange={(selected) =>
                    onChange({
                        ...filters,
                        actionTypes: selected as ManagedAgentActionType[],
                    })
                }
            />
            <FilterChipMultiSelect
                label={t('filters.content')}
                options={getTargetTypeOptions(t)}
                selected={filters.targetTypes}
                onChange={(selected) =>
                    onChange({
                        ...filters,
                        targetTypes: selected as ManagedAgentTargetType[],
                    })
                }
            />
            <FilterChipDateRange
                value={filters.dateRange}
                onChange={(dateRange) => onChange({ ...filters, dateRange })}
            />
            {isActive && (
                <Button
                    size="compact-xs"
                    variant="subtle"
                    color="gray"
                    radius="xl"
                    ml="auto"
                    leftSection={<MantineIcon icon={IconX} size="sm" />}
                    onClick={() => onChange(EMPTY_ACTION_FILTERS)}
                >
                    {t('filters.clear')}
                </Button>
            )}
        </Box>
    );
};

const FilteredActionsView: FC<{
    filters: ActionFiltersState;
    debouncedSearch: string;
    selectedActionUuid: string | null;
    onSelectAction: (action: ManagedAgentAction) => void;
}> = ({ filters, debouncedSearch, selectedActionUuid, onSelectAction }) => {
    const { t } = useTranslation('managedAgent');
    const queryFilters = useMemo<ManagedAgentActionQueryFilters>(
        () => ({
            search: debouncedSearch.trim() || undefined,
            actionTypes:
                filters.actionTypes.length > 0
                    ? filters.actionTypes
                    : undefined,
            targetTypes:
                filters.targetTypes.length > 0
                    ? filters.targetTypes
                    : undefined,
            dateFrom: filters.dateRange[0]
                ? format(filters.dateRange[0], 'yyyy-MM-dd')
                : undefined,
            dateTo: filters.dateRange[1]
                ? format(filters.dateRange[1], 'yyyy-MM-dd')
                : undefined,
        }),
        [
            debouncedSearch,
            filters.actionTypes,
            filters.targetTypes,
            filters.dateRange,
        ],
    );
    const { data: actions, isLoading } = useManagedAgentActions({
        filters: queryFilters,
    });

    const dayGroups = useMemo(() => {
        const groups: Array<{ day: string; actions: ManagedAgentAction[] }> =
            [];
        (actions ?? []).forEach((action) => {
            const day = format(new Date(action.createdAt), 'MMM d, yyyy');
            const lastGroup = groups[groups.length - 1];
            if (lastGroup && lastGroup.day === day) {
                lastGroup.actions.push(action);
            } else {
                groups.push({ day, actions: [action] });
            }
        });
        return groups;
    }, [actions]);

    return (
        <Table className={classes.table}>
            <Table.Thead>
                <Table.Tr>
                    <Table.Th w={140}>{t('table.action')}</Table.Th>
                    <Table.Th w={300}>{t('table.name')}</Table.Th>
                    <Table.Th>{t('table.message')}</Table.Th>
                </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
                {isLoading ? (
                    <Table.Tr>
                        <Table.Td colSpan={3}>
                            <Group gap="xs" justify="center" py="md">
                                <Loader size={8} type="dots" color="dark" />
                                <Text fz="xs" c="dimmed">
                                    {t('filters.searching')}
                                </Text>
                            </Group>
                        </Table.Td>
                    </Table.Tr>
                ) : dayGroups.length === 0 ? (
                    <Table.Tr>
                        <Table.Td colSpan={3}>
                            <Stack gap={2} align="center" py="lg">
                                <Text fw={500} fz="sm">
                                    {t('filters.noMatches')}
                                </Text>
                                <Text fz="xs" c="dimmed">
                                    {t('filters.noMatchesHint')}
                                </Text>
                            </Stack>
                        </Table.Td>
                    </Table.Tr>
                ) : (
                    dayGroups.map((group) => (
                        <Fragment key={group.day}>
                            <Table.Tr className={classes.dayHeaderRow}>
                                <Table.Td colSpan={3}>
                                    <Text fz="xs" fw={500} c="dimmed">
                                        {group.day}
                                    </Text>
                                </Table.Td>
                            </Table.Tr>
                            {group.actions.map((action) => (
                                <ActionRow
                                    key={action.actionUuid}
                                    action={action}
                                    selected={
                                        selectedActionUuid === action.actionUuid
                                    }
                                    onSelect={onSelectAction}
                                />
                            ))}
                        </Fragment>
                    ))
                )}
            </Table.Tbody>
        </Table>
    );
};

const ManagedAgentActivityPage: FC = () => {
    const { t } = useTranslation('managedAgent');
    const projectUuid = useProjectUuid();
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
    const runtime = useManagedAgentRuntime(
        projectUuid ?? '',
        canManageAutopilot,
    );
    const { data: latestRun } = useManagedAgentLatestRun({
        enabled: canManageAutopilot,
    });
    const isRunning = latestRun?.status === ManagedAgentRunStatus.STARTED;
    const {
        data: runsData,
        isLoading,
        hasNextPage,
        fetchNextPage,
        isFetchingNextPage,
    } = useManagedAgentRuns({ enabled: canManageAutopilot });
    const runs = useMemo<ManagedAgentRun[]>(
        () => runsData?.pages.flatMap((p) => p.runs) ?? [],
        [runsData],
    );
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
            void queryClient.invalidateQueries({
                queryKey: ['managed-agent-runs', projectUuid],
            });
            if (curr === ManagedAgentRunStatus.COMPLETED) {
                const count = latestRun?.actionCount ?? 0;
                showToastSuccess({
                    title: t('page.toasts.finished'),
                    subtitle:
                        count === 0
                            ? t('page.toasts.noActionsNeeded')
                            : t('page.toasts.actionsTaken', { count }),
                });
            } else if (curr === ManagedAgentRunStatus.ERROR) {
                showToastError({
                    title: t('page.toasts.runFailed'),
                    subtitle: latestRun?.error ?? t('page.toasts.unknownError'),
                });
            }
        }
        previousRunStatus.current = curr;
    }, [
        latestRun?.status,
        latestRun?.actionCount,
        latestRun?.error,
        projectUuid,
        queryClient,
        showToastSuccess,
        showToastError,
        t,
    ]);
    const [selected, setSelected] = useState<ManagedAgentAction | null>(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [actionFilters, setActionFilters] =
        useState<ActionFiltersState>(EMPTY_ACTION_FILTERS);
    const [debouncedSearch] = useDebouncedValue(actionFilters.search, 300);
    const filtersActive = hasActiveActionFilters(actionFilters);
    const [openQuietGroups, setOpenQuietGroups] = useState<Set<string>>(
        new Set(),
    );

    const toggleQuietGroup = useCallback((groupId: string) => {
        setOpenQuietGroups((prev) => {
            const next = new Set(prev);
            if (next.has(groupId)) {
                next.delete(groupId);
            } else {
                next.add(groupId);
            }
            return next;
        });
    }, []);

    // Collapse consecutive completed runs without actions into a single
    // expandable group. The newest run always stays visible.
    const displayRows = useMemo<DisplayRow[]>(() => {
        const rows: DisplayRow[] = [];
        let quietRuns: ManagedAgentRun[] = [];
        const flushQuietRuns = () => {
            if (quietRuns.length === 0) return;
            rows.push({
                type: 'quietGroup',
                groupId: quietRuns[0].runUuid,
                runs: quietRuns,
            });
            quietRuns = [];
        };
        runs.forEach((run, index) => {
            if (index > 0 && runVariant(run) === 'completed-empty') {
                quietRuns.push(run);
            } else {
                flushQuietRuns();
                rows.push({ type: 'run', run });
            }
        });
        flushQuietRuns();
        return rows;
    }, [runs]);
    const [userOpenState, setUserOpenState] = useState<Map<string, boolean>>(
        new Map(),
    );
    const [defaultOpenSet, setDefaultOpenSet] = useState<Set<string>>(
        new Set(),
    );
    useEffect(() => {
        setDefaultOpenSet((prev) => {
            const next = new Set(prev);
            runs.filter((r) => runVariant(r) !== 'completed-empty')
                .slice(0, 3)
                .forEach((r) => {
                    next.add(r.runUuid);
                });
            return next;
        });
    }, [runs]);

    const isRunOpen = useCallback(
        (runUuid: string, isLive: boolean) => {
            const userValue = userOpenState.get(runUuid);
            if (userValue !== undefined) return userValue;
            if (isLive) return true;
            return defaultOpenSet.has(runUuid);
        },
        [userOpenState, defaultOpenSet],
    );

    const toggleRun = useCallback(
        (runUuid: string, isLive: boolean) => {
            setUserOpenState((prev) => {
                const next = new Map(prev);
                next.set(runUuid, !isRunOpen(runUuid, isLive));
                return next;
            });
        },
        [isRunOpen],
    );

    const handleSelectAction = useCallback(
        (action: ManagedAgentAction, runUuid: string) => {
            setSettingsOpen(false);
            setSelected(action);
            setUserOpenState((prev) => {
                const next = new Map(prev);
                next.set(runUuid, true);
                return next;
            });
        },
        [],
    );

    const runNowMutation = useMutation<undefined, ApiError>({
        mutationFn: () => runHeartbeat(projectUuid!),
        onSuccess: () => {
            showToastSuccess({
                title: t('page.toasts.runStarted'),
                subtitle: t('page.toasts.runStartedSubtitle'),
            });
            void queryClient.invalidateQueries({
                queryKey: ['managed-agent-actions', projectUuid],
            });
            void queryClient.invalidateQueries({
                queryKey: ['managed-agent-latest-run', projectUuid],
            });
            void queryClient.invalidateQueries({
                queryKey: ['managed-agent-runs', projectUuid],
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: t('page.toasts.startFailed'),
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
        <Stack h={`calc(100vh - ${NAVBAR_HEIGHT}px)`} gap={0} flex={1}>
            <ResizableSplitter
                handleLabel={t('page.resizeSidebar')}
                classNames={{ handle: classes.resizeHandle }}
                orientation="horizontal"
            >
                <ResizableSplitter.Pane
                    id="activity-table"
                    defaultSize={selected || settingsOpen ? 65 : 100}
                    min={40}
                >
                    <Box className={classes.page}>
                        <Stack gap="lg">
                            <SetupSection
                                runtime={runtime}
                                canManageAiSettings={
                                    user.data?.ability.can(
                                        'manage',
                                        'Organization',
                                    ) ?? false
                                }
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
                                        {settings?.enabled
                                            ? t('page.empty.noRunsTitle')
                                            : t('page.empty.offTitle')}
                                    </Text>
                                    <Text fz="xs" c="dimmed">
                                        {settings?.enabled
                                            ? t('page.empty.noRunsDescription')
                                            : t('page.empty.offDescription')}
                                    </Text>
                                </Box>
                            ) : (
                                <Box className={classes.tableWrapper}>
                                    <ActionFilterBar
                                        filters={actionFilters}
                                        onChange={setActionFilters}
                                    />
                                    {filtersActive ? (
                                        <FilteredActionsView
                                            filters={actionFilters}
                                            debouncedSearch={debouncedSearch}
                                            selectedActionUuid={
                                                selected?.actionUuid ?? null
                                            }
                                            onSelectAction={(action) => {
                                                setSettingsOpen(false);
                                                setSelected(action);
                                            }}
                                        />
                                    ) : (
                                        <Table className={classes.table}>
                                            <Table.Thead>
                                                <Table.Tr>
                                                    <Table.Th w={140}>
                                                        {t('table.action')}
                                                    </Table.Th>
                                                    <Table.Th w={300}>
                                                        {t('table.name')}
                                                    </Table.Th>
                                                    <Table.Th>
                                                        {t('table.message')}
                                                    </Table.Th>
                                                </Table.Tr>
                                            </Table.Thead>
                                            {displayRows.map((row) => {
                                                if (row.type === 'quietGroup') {
                                                    return (
                                                        <QuietRunsGroup
                                                            key={`quiet-${row.groupId}`}
                                                            runs={row.runs}
                                                            isOpen={openQuietGroups.has(
                                                                row.groupId,
                                                            )}
                                                            onToggle={() =>
                                                                toggleQuietGroup(
                                                                    row.groupId,
                                                                )
                                                            }
                                                        />
                                                    );
                                                }
                                                const { run } = row;
                                                const isLive =
                                                    run.status ===
                                                    ManagedAgentRunStatus.STARTED;
                                                return (
                                                    <RunRow
                                                        key={run.runUuid}
                                                        run={run}
                                                        isOpen={isRunOpen(
                                                            run.runUuid,
                                                            isLive,
                                                        )}
                                                        onToggle={() =>
                                                            toggleRun(
                                                                run.runUuid,
                                                                isLive,
                                                            )
                                                        }
                                                        selectedActionUuid={
                                                            selected?.actionUuid ??
                                                            null
                                                        }
                                                        onSelectAction={(
                                                            action,
                                                        ) =>
                                                            handleSelectAction(
                                                                action,
                                                                run.runUuid,
                                                            )
                                                        }
                                                    />
                                                );
                                            })}
                                            {hasNextPage && (
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
                                                                    void fetchNextPage()
                                                                }
                                                                disabled={
                                                                    isFetchingNextPage
                                                                }
                                                            >
                                                                {isFetchingNextPage
                                                                    ? t(
                                                                          'page.loading',
                                                                      )
                                                                    : t(
                                                                          'page.loadOlderRuns',
                                                                      )}
                                                            </UnstyledButton>
                                                        </Table.Td>
                                                    </Table.Tr>
                                                </Table.Tbody>
                                            )}
                                        </Table>
                                    )}
                                </Box>
                            )}
                        </Stack>
                    </Box>
                </ResizableSplitter.Pane>

                {(selected || settingsOpen) && (
                    <ResizableSplitter.Pane
                        id={selected ? 'detail-sidebar' : 'settings-sidebar'}
                        defaultSize={35}
                        min={25}
                        max={50}
                    >
                        {selected ? (
                            <DetailSidebar
                                key={selected.actionUuid}
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
                                policy={
                                    settings?.policy ??
                                    DEFAULT_MANAGED_AGENT_POLICY
                                }
                                scopedSpaceUuids={
                                    settings?.scopedSpaceUuids ?? []
                                }
                                isLoading={settingsLoading}
                                onClose={() => setSettingsOpen(false)}
                            />
                        )}
                    </ResizableSplitter.Pane>
                )}
            </ResizableSplitter>
        </Stack>
    );
};

export default ManagedAgentActivityPage;
