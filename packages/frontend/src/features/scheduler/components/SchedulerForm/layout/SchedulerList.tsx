import { subject } from '@casl/ability';
import {
    getHumanReadableCronExpression,
    isEmailTarget,
    isGoogleChatTarget,
    isMsTeamsTarget,
    isSlackTarget,
    SchedulerFormat,
    type ApiError,
    type ApiSavedChartPaginatedSchedulersResponse,
    type SchedulerAndTargets,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Button,
    Group,
    Loader,
    Paper,
    Stack,
    Switch,
    Text,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import {
    IconBell,
    IconBrandGoogle,
    IconBrandSlack,
    IconBrandTeams,
    IconCalendarClock,
    IconCalendarTime,
    IconClock,
    IconHistory,
    IconMail,
    IconPencil,
    IconPlus,
    IconSearch,
    IconSend,
    IconSparkles,
    IconTrash,
    IconX,
    type Icon,
} from '@tabler/icons-react';
import { type UseInfiniteQueryResult } from '@tanstack/react-query';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import ErrorState from '../../../../../components/common/ErrorState';
import MantineIcon from '../../../../../components/common/MantineIcon';
import {
    Frequency,
    mapCronExpressionToFrequency,
} from '../../../../../components/CronInput/cronInputUtils';
import { getRunStatusConfig } from '../../../../../components/SchedulersView/SchedulersViewUtils';
import { useAiAgentButtonVisibility } from '../../../../../ee/features/aiCopilot/hooks/useAiAgentsButtonVisibility';
import { useGetSlackChannelName } from '../../../../../hooks/slack/useGetSlackChannelName';
import { useActiveProjectUuid } from '../../../../../hooks/useActiveProject';
import { useProject } from '../../../../../hooks/useProject';
import useApp from '../../../../../providers/App/useApp';
import { useSendNowSchedulerByUuid } from '../../../hooks/useScheduler';
import { useSchedulerAiAugmentation } from '../../../hooks/useSchedulerAiAugmentation';
import { useSchedulersEnabledUpdateMutation } from '../../../hooks/useSchedulersUpdateMutation';
import ConfirmPauseSchedulerModal from '../../ConfirmPauseSchedulerModal';
import ConfirmSendNowModal from '../../ConfirmSendNowModal';
import { SchedulerDeleteModal } from '../../SchedulerDeleteModal';
import { getSchedulerDeliveryType } from '../../types';
import { getNextRuns } from './nextRuns';
import classes from './SchedulerDeliveryModal.module.css';

dayjs.extend(relativeTime);

const FREQUENCY_LABEL: Record<Frequency, string> = {
    [Frequency.HOURLY]: 'Hourly',
    [Frequency.DAILY]: 'Daily',
    [Frequency.WEEKLY]: 'Weekly',
    [Frequency.MONTHLY]: 'Monthly',
    [Frequency.CUSTOM]: 'Custom',
};

const FORMAT_LABEL: Partial<Record<SchedulerFormat, string>> = {
    [SchedulerFormat.CSV]: '.csv',
    [SchedulerFormat.XLSX]: '.xlsx',
    [SchedulerFormat.IMAGE]: 'Image',
    [SchedulerFormat.PDF]: 'PDF',
};

const DetailPill: FC<{
    icon?: Icon;
    dot?: 'active' | 'paused';
    label: string;
}> = ({ icon, dot, label }) => (
    <Paper withBorder radius="xl" px="xs" py={2}>
        <Group gap={6} wrap="nowrap">
            {dot && (
                <span
                    className={`${classes.badgeDot} ${
                        dot === 'active'
                            ? classes.statusDotActive
                            : classes.statusDotPaused
                    }`}
                />
            )}
            {icon && <MantineIcon icon={icon} size="sm" color="ldGray.6" />}
            <Text size="xs" truncate maw={220}>
                {label}
            </Text>
        </Group>
    </Paper>
);

const SchedulerDetail: FC<{
    scheduler: SchedulerAndTargets;
    isThresholdAlert: boolean;
    onEdit: (schedulerUuid: string) => void;
    onDelete: (schedulerUuid: string) => void;
    onViewHistory: (scheduler: SchedulerAndTargets) => void;
}> = ({ scheduler, isThresholdAlert, onEdit, onDelete, onViewHistory }) => {
    const { activeProjectUuid } = useActiveProjectUuid();
    const { data: project } = useProject(activeProjectUuid);
    const { user } = useApp();
    const isAiVisible = useAiAgentButtonVisibility();

    const { mutate: mutateSchedulerEnabled } =
        useSchedulersEnabledUpdateMutation(scheduler.schedulerUuid);
    const sendNowMutation = useSendNowSchedulerByUuid(scheduler.schedulerUuid);
    const { data: aiAugmentation } = useSchedulerAiAugmentation(
        scheduler.schedulerUuid,
        { enabled: isAiVisible },
    );

    const [isConfirmSendNowOpen, setIsConfirmSendNowOpen] = useState(false);
    const [isConfirmPauseOpen, setIsConfirmPauseOpen] = useState(false);

    const canManage = useMemo(
        () =>
            user.data?.ability?.can(
                'manage',
                subject('ScheduledDeliveries', {
                    organizationUuid: user.data?.organizationUuid,
                    projectUuid: activeProjectUuid,
                    userUuid: scheduler.createdBy,
                }),
            ),
        [user.data, activeProjectUuid, scheduler.createdBy],
    );
    const canCreate = useMemo(
        () =>
            user.data?.ability?.can(
                'create',
                subject('ScheduledDeliveries', {
                    organizationUuid: user.data?.organizationUuid,
                    projectUuid: activeProjectUuid,
                }),
            ),
        [user.data, activeProjectUuid],
    );

    const frequency =
        FREQUENCY_LABEL[mapCronExpressionToFrequency(scheduler.cron)];
    const formatLabel = FORMAT_LABEL[scheduler.format];

    const slackChannelIds = useMemo(
        () => scheduler.targets.filter(isSlackTarget).map((t) => t.channel),
        [scheduler.targets],
    );
    const { getSlackChannelName } = useGetSlackChannelName({
        includeChannelIds: slackChannelIds,
        enabled: slackChannelIds.length > 0,
    });
    const recipientChips = useMemo(
        () =>
            scheduler.targets.map((target) => {
                if (isEmailTarget(target)) {
                    return {
                        key: target.schedulerEmailTargetUuid,
                        icon: IconMail,
                        label: target.recipient,
                    };
                }
                if (isSlackTarget(target)) {
                    return {
                        key: target.schedulerSlackTargetUuid,
                        icon: IconBrandSlack,
                        label:
                            getSlackChannelName(target.channel) ??
                            target.channel,
                    };
                }
                if (isMsTeamsTarget(target)) {
                    return {
                        key: target.schedulerMsTeamsTargetUuid,
                        icon: IconBrandTeams,
                        label: 'Microsoft Teams',
                    };
                }
                if (isGoogleChatTarget(target)) {
                    return {
                        key: target.schedulerGoogleChatTargetUuid,
                        icon: IconBrandGoogle,
                        label: 'Google Chat',
                    };
                }
                return null;
            }),
        [scheduler.targets, getSlackChannelName],
    );
    const runStatus = scheduler.latestRun
        ? getRunStatusConfig(scheduler.latestRun.runStatus)
        : null;
    const hasHistoryResource = !!(
        scheduler.dashboardUuid || scheduler.savedChartUuid
    );

    const nextRuns = useMemo(
        () =>
            scheduler.enabled
                ? getNextRuns(
                      scheduler.cron,
                      scheduler.timezone || project?.schedulerTimezone,
                  )
                : [],
        [
            scheduler.enabled,
            scheduler.cron,
            scheduler.timezone,
            project?.schedulerTimezone,
        ],
    );

    if (!project) return null;

    return (
        <div className={classes.listDetail}>
            <Stack gap="md" className={classes.listDetailContent}>
                <Stack gap={8}>
                    <Group
                        justify="space-between"
                        wrap="nowrap"
                        align="flex-start"
                    >
                        <Text fw={600} fz="xl" lineClamp={2}>
                            {scheduler.name}
                        </Text>
                        {canManage && (
                            <Tooltip
                                withinPortal
                                label={
                                    scheduler.enabled
                                        ? 'Pause this delivery'
                                        : 'Paused. Toggle to resume'
                                }
                            >
                                <Switch
                                    size="md"
                                    checked={scheduler.enabled}
                                    onChange={() => {
                                        if (scheduler.enabled) {
                                            setIsConfirmPauseOpen(true);
                                        } else {
                                            mutateSchedulerEnabled(true);
                                        }
                                    }}
                                />
                            </Tooltip>
                        )}
                    </Group>

                    <Group gap={6}>
                        <DetailPill label={frequency} />
                        {formatLabel && <DetailPill label={formatLabel} />}
                        <DetailPill
                            dot={scheduler.enabled ? 'active' : 'paused'}
                            label={scheduler.enabled ? 'Active' : 'Paused'}
                        />
                        {isThresholdAlert && (
                            <DetailPill icon={IconBell} label="Alert" />
                        )}
                    </Group>
                </Stack>

                <Stack gap="lg" mt="sm">
                    <Group gap="sm" wrap="nowrap" align="flex-start">
                        <MantineIcon
                            icon={IconClock}
                            size="md"
                            color="ldGray.5"
                        />
                        <Stack gap={4}>
                            <span className={classes.detailMetaLabel}>
                                Runs
                            </span>
                            <Text size="sm">
                                {getHumanReadableCronExpression(
                                    scheduler.cron,
                                    scheduler.timezone ||
                                        project.schedulerTimezone,
                                )}
                            </Text>
                        </Stack>
                    </Group>

                    {nextRuns.length > 0 && (
                        <Group gap="sm" wrap="nowrap" align="flex-start">
                            <MantineIcon
                                icon={IconCalendarTime}
                                size="md"
                                color="ldGray.5"
                            />
                            <Stack gap={4}>
                                <span className={classes.detailMetaLabel}>
                                    Next runs
                                </span>
                                <Stack gap={2}>
                                    {nextRuns.map((run) => (
                                        <Group key={run.label} gap="xs">
                                            <Text size="sm">{run.label}</Text>
                                            <Text size="xs" c="dimmed">
                                                {run.relative}
                                            </Text>
                                        </Group>
                                    ))}
                                </Stack>
                            </Stack>
                        </Group>
                    )}

                    <Group gap="sm" wrap="nowrap" align="flex-start">
                        <MantineIcon
                            icon={IconCalendarClock}
                            size="md"
                            color="ldGray.5"
                        />
                        <Stack gap={4}>
                            <span className={classes.detailMetaLabel}>
                                Last run
                            </span>
                            {scheduler.latestRun && runStatus ? (
                                <Group gap="xs">
                                    <Text size="sm">
                                        {dayjs(
                                            scheduler.latestRun.scheduledTime,
                                        ).fromNow()}
                                    </Text>
                                    <Badge
                                        variant="light"
                                        size="sm"
                                        radius="sm"
                                        color={runStatus.color}
                                        leftSection={
                                            <MantineIcon
                                                icon={runStatus.icon}
                                                size={10}
                                            />
                                        }
                                    >
                                        {runStatus.label}
                                    </Badge>
                                </Group>
                            ) : (
                                <Text size="sm" c="dimmed" fs="italic">
                                    Not run yet
                                </Text>
                            )}
                        </Stack>
                    </Group>

                    <Group gap="sm" wrap="nowrap" align="flex-start">
                        <MantineIcon
                            icon={IconMail}
                            size="md"
                            color="ldGray.5"
                        />
                        <Stack gap={4}>
                            <span className={classes.detailMetaLabel}>
                                {scheduler.targets.length} recipient
                                {scheduler.targets.length === 1 ? '' : 's'}
                            </span>
                            <Group gap={6}>
                                {recipientChips
                                    .filter((chip) => chip !== null)
                                    .map((chip) => (
                                        <DetailPill
                                            key={chip.key}
                                            icon={chip.icon}
                                            label={chip.label}
                                        />
                                    ))}
                            </Group>
                        </Stack>
                    </Group>

                    {aiAugmentation && (
                        <Group gap="sm" wrap="nowrap" align="flex-start">
                            <MantineIcon
                                icon={IconSparkles}
                                size="md"
                                color="ldGray.5"
                            />
                            <Stack gap={4}>
                                <span className={classes.detailMetaLabel}>
                                    AI summary
                                </span>
                                <Text size="sm" lineClamp={2}>
                                    {aiAugmentation.prompt}
                                </Text>
                            </Stack>
                        </Group>
                    )}

                    {hasHistoryResource && canManage && (
                        <Button
                            variant="subtle"
                            size="compact-sm"
                            w="fit-content"
                            pl={0}
                            leftSection={
                                <MantineIcon icon={IconHistory} size="sm" />
                            }
                            onClick={() => onViewHistory(scheduler)}
                        >
                            View run history
                        </Button>
                    )}
                </Stack>
            </Stack>

            {(canManage || canCreate) && (
                <div className={classes.listDetailFooter}>
                    {canManage ? (
                        <Tooltip withinPortal label="Delete">
                            <ActionIcon
                                variant="default"
                                size="lg"
                                onClick={() =>
                                    onDelete(scheduler.schedulerUuid)
                                }
                            >
                                <MantineIcon icon={IconTrash} color="red" />
                            </ActionIcon>
                        </Tooltip>
                    ) : (
                        <span />
                    )}
                    <Group gap="sm">
                        {canManage && (
                            <Button
                                variant="default"
                                leftSection={<MantineIcon icon={IconPencil} />}
                                onClick={() => onEdit(scheduler.schedulerUuid)}
                            >
                                Edit
                            </Button>
                        )}
                        <Button
                            leftSection={<MantineIcon icon={IconSend} />}
                            onClick={() => setIsConfirmSendNowOpen(true)}
                            loading={sendNowMutation.isLoading}
                        >
                            Send now
                        </Button>
                    </Group>
                </div>
            )}

            <ConfirmSendNowModal
                opened={isConfirmSendNowOpen}
                onClose={() => setIsConfirmSendNowOpen(false)}
                schedulerName={scheduler.name}
                deliveryType={getSchedulerDeliveryType(scheduler)}
                loading={sendNowMutation.isLoading}
                onConfirm={() => {
                    sendNowMutation.mutate();
                    setIsConfirmSendNowOpen(false);
                }}
            />
            <ConfirmPauseSchedulerModal
                opened={isConfirmPauseOpen}
                onClose={() => setIsConfirmPauseOpen(false)}
                schedulerName={scheduler.name}
                onConfirm={() => {
                    mutateSchedulerEnabled(false);
                    setIsConfirmPauseOpen(false);
                }}
                description="This will pause the scheduled delivery. It will not run until it is enabled again."
            />
        </div>
    );
};

type Props = {
    schedulersQuery: UseInfiniteQueryResult<
        ApiSavedChartPaginatedSchedulersResponse['results'],
        ApiError
    >;
    isThresholdAlert: boolean;
    searchQuery?: string;
    onSearchQueryChange?: (searchQuery: string | undefined) => void;
    onCreate: () => void;
    onEdit: (schedulerUuid: string) => void;
    onViewHistory: (scheduler: SchedulerAndTargets) => void;
};

export const SchedulerList: FC<Props> = ({
    schedulersQuery,
    isThresholdAlert,
    searchQuery,
    onSearchQueryChange,
    onCreate,
    onEdit,
    onViewHistory,
}) => {
    const {
        data,
        isInitialLoading,
        isFetching,
        error,
        hasNextPage,
        fetchNextPage,
        isFetchingNextPage,
    } = schedulersQuery;

    const [selectedUuid, setSelectedUuid] = useState<string>();
    const [deleteUuid, setDeleteUuid] = useState<string>();
    const scrollRef = useRef<HTMLDivElement>(null);

    const schedulers = useMemo(() => {
        const all = data?.pages.flatMap((page) => page.data) ?? [];
        return all.filter((scheduler) => {
            const isAlert =
                scheduler.thresholds && scheduler.thresholds.length > 0;
            if (isThresholdAlert !== !!isAlert) return false;
            return scheduler.format !== SchedulerFormat.GSHEETS;
        });
    }, [data, isThresholdAlert]);

    const selected =
        schedulers.find((s) => s.schedulerUuid === selectedUuid) ??
        schedulers[0];

    const fetchMoreOnBottomReached = useCallback(
        (el?: HTMLDivElement | null) => {
            if (!el) return;
            const { scrollHeight, scrollTop, clientHeight } = el;
            if (
                scrollHeight - scrollTop - clientHeight < 200 &&
                !isFetchingNextPage &&
                hasNextPage
            ) {
                void fetchNextPage();
            }
        },
        [fetchNextPage, isFetchingNextPage, hasNextPage],
    );

    useEffect(() => {
        fetchMoreOnBottomReached(scrollRef.current);
    }, [fetchMoreOnBottomReached]);

    const noun = isThresholdAlert ? 'alert' : 'delivery';
    const isSearching = Boolean(searchQuery);
    const isEmpty = schedulers.length === 0;

    if (isInitialLoading) {
        return (
            <div className={classes.listBody}>
                <Stack
                    style={{ gridColumn: '1 / -1' }}
                    align="center"
                    justify="center"
                >
                    <Loader size="lg" />
                </Stack>
            </div>
        );
    }

    if (error) {
        return (
            <div className={classes.listBody}>
                <Stack style={{ gridColumn: '1 / -1' }} p="xl">
                    <ErrorState error={error.error} />
                </Stack>
            </div>
        );
    }

    if (isEmpty && !isSearching) {
        return (
            <div className={classes.listBody}>
                <Stack
                    style={{ gridColumn: '1 / -1' }}
                    align="center"
                    justify="center"
                    gap="sm"
                    p="xl"
                >
                    <MantineIcon
                        icon={isThresholdAlert ? IconBell : IconSend}
                        size={32}
                        color="ldGray.5"
                    />
                    <Text fw={700} fz="lg">
                        {isThresholdAlert
                            ? 'Get notified when your data crosses a threshold'
                            : 'Deliver this on a schedule'}
                    </Text>
                    <Text size="sm" c="dimmed" ta="center" maw={380}>
                        {isThresholdAlert
                            ? 'Alerts check your data on a schedule and ping you by email or Slack when the condition is met.'
                            : 'Send it by email or Slack as a spreadsheet, image, or PDF, with an optional AI-written summary.'}
                    </Text>
                    <Button
                        mt="sm"
                        leftSection={<MantineIcon icon={IconPlus} />}
                        onClick={onCreate}
                    >
                        New {noun}
                    </Button>
                </Stack>
            </div>
        );
    }

    return (
        <div className={classes.listBody}>
            <div className={classes.listSidebar}>
                {onSearchQueryChange && (
                    <TextInput
                        size="xs"
                        placeholder="Search..."
                        leftSection={<MantineIcon icon={IconSearch} />}
                        rightSection={
                            isFetching && !isInitialLoading ? (
                                <Loader size={12} />
                            ) : (
                                searchQuery && (
                                    <ActionIcon
                                        onClick={() =>
                                            onSearchQueryChange(undefined)
                                        }
                                        variant="transparent"
                                        size="xs"
                                        color="ldGray.5"
                                    >
                                        <MantineIcon icon={IconX} />
                                    </ActionIcon>
                                )
                            )
                        }
                        value={searchQuery ?? ''}
                        onChange={(e) =>
                            onSearchQueryChange(
                                e.currentTarget.value || undefined,
                            )
                        }
                    />
                )}
                <div
                    ref={scrollRef}
                    className={classes.listItems}
                    onScroll={(e) =>
                        fetchMoreOnBottomReached(e.target as HTMLDivElement)
                    }
                >
                    {schedulers.map((scheduler) => (
                        <button
                            key={scheduler.schedulerUuid}
                            type="button"
                            className={
                                scheduler.schedulerUuid ===
                                selected?.schedulerUuid
                                    ? `${classes.listItem} ${classes.listItemActive}`
                                    : classes.listItem
                            }
                            onClick={() =>
                                setSelectedUuid(scheduler.schedulerUuid)
                            }
                        >
                            <span
                                className={`${classes.statusDot} ${
                                    scheduler.enabled
                                        ? classes.statusDotActive
                                        : classes.statusDotPaused
                                }`}
                            />
                            <Stack gap={0} miw={0}>
                                <span className={classes.listItemName}>
                                    {scheduler.name}
                                </span>
                                <span className={classes.listItemMeta}>
                                    {
                                        FREQUENCY_LABEL[
                                            mapCronExpressionToFrequency(
                                                scheduler.cron,
                                            )
                                        ]
                                    }
                                    {!scheduler.enabled && ' · Paused'}
                                </span>
                            </Stack>
                        </button>
                    ))}
                    {isEmpty && isSearching && (
                        <Text size="sm" c="dimmed" ta="center" mt="md">
                            No results
                        </Text>
                    )}
                    {isFetchingNextPage && (
                        <Group justify="center" py="xs">
                            <Loader size="xs" />
                        </Group>
                    )}
                </div>
                <button
                    type="button"
                    className={classes.newDeliveryButton}
                    onClick={onCreate}
                >
                    <MantineIcon
                        icon={IconPlus}
                        size="sm"
                        display="inline"
                        style={{ marginRight: 6, marginBottom: -2 }}
                    />
                    New {noun}
                </button>
            </div>

            {selected ? (
                <SchedulerDetail
                    key={selected.schedulerUuid}
                    scheduler={selected}
                    isThresholdAlert={isThresholdAlert}
                    onEdit={onEdit}
                    onDelete={setDeleteUuid}
                    onViewHistory={onViewHistory}
                />
            ) : (
                <Stack align="center" justify="center">
                    <Text size="sm" c="dimmed">
                        Select a {noun} to see its details
                    </Text>
                </Stack>
            )}

            {deleteUuid && (
                <SchedulerDeleteModal
                    opened
                    schedulerUuid={deleteUuid}
                    onConfirm={() => setDeleteUuid(undefined)}
                    onClose={() => setDeleteUuid(undefined)}
                />
            )}
        </div>
    );
};
