import { subject } from '@casl/ability';
import {
    getHumanReadableCronExpression,
    isEmailTarget,
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
    Stack,
    Switch,
    Text,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import {
    IconBell,
    IconBrandSlack,
    IconCalendarClock,
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
    const emailCount = scheduler.targets.filter(isEmailTarget).length;
    const slackCount = scheduler.targets.filter(isSlackTarget).length;
    const otherCount = scheduler.targets.length - emailCount - slackCount;
    const runStatus = scheduler.latestRun
        ? getRunStatusConfig(scheduler.latestRun.runStatus)
        : null;
    const hasHistoryResource = !!(
        scheduler.dashboardUuid || scheduler.savedChartUuid
    );

    if (!project) return null;

    return (
        <div className={classes.listDetail}>
            <Stack gap="md">
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                    <Text fw={700} fz="xl" lineClamp={2}>
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

                <Group gap="xs">
                    <Badge variant="light" radius="sm" size="sm">
                        {frequency}
                    </Badge>
                    {FORMAT_LABEL[scheduler.format] && (
                        <Badge
                            variant="light"
                            color="ldGray.6"
                            radius="sm"
                            size="sm"
                        >
                            {FORMAT_LABEL[scheduler.format]}
                        </Badge>
                    )}
                    <Badge
                        variant="light"
                        radius="sm"
                        size="sm"
                        color={scheduler.enabled ? 'green' : 'ldGray.6'}
                    >
                        {scheduler.enabled ? 'Active' : 'Paused'}
                    </Badge>
                    {isThresholdAlert && (
                        <Badge
                            variant="light"
                            radius="sm"
                            size="sm"
                            color="orange"
                            leftSection={
                                <MantineIcon icon={IconBell} size={10} />
                            }
                        >
                            Alert
                        </Badge>
                    )}
                </Group>

                <Stack gap="sm" mt="xs">
                    <Group gap="sm" wrap="nowrap" align="flex-start">
                        <MantineIcon
                            icon={IconClock}
                            size="md"
                            color="ldGray.6"
                        />
                        <Stack gap={0}>
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

                    <Group gap="sm" wrap="nowrap" align="flex-start">
                        <MantineIcon
                            icon={IconCalendarClock}
                            size="md"
                            color="ldGray.6"
                        />
                        <Stack gap={0}>
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
                            color="ldGray.6"
                        />
                        <Stack gap={0}>
                            <span className={classes.detailMetaLabel}>
                                Recipients
                            </span>
                            <Group gap="xs">
                                <Text size="sm">
                                    {scheduler.targets.length} recipient
                                    {scheduler.targets.length === 1 ? '' : 's'}
                                </Text>
                                {emailCount > 0 && (
                                    <Badge
                                        variant="light"
                                        color="ldGray.6"
                                        radius="sm"
                                        size="sm"
                                        leftSection={
                                            <MantineIcon
                                                icon={IconMail}
                                                size={10}
                                            />
                                        }
                                    >
                                        {emailCount}
                                    </Badge>
                                )}
                                {slackCount > 0 && (
                                    <Badge
                                        variant="light"
                                        color="ldGray.6"
                                        radius="sm"
                                        size="sm"
                                        leftSection={
                                            <MantineIcon
                                                icon={IconBrandSlack}
                                                size={10}
                                            />
                                        }
                                    >
                                        {slackCount}
                                    </Badge>
                                )}
                                {otherCount > 0 && (
                                    <Badge
                                        variant="light"
                                        color="ldGray.6"
                                        radius="sm"
                                        size="sm"
                                    >
                                        +{otherCount}
                                    </Badge>
                                )}
                            </Group>
                        </Stack>
                    </Group>

                    {aiAugmentation && (
                        <Group gap="sm" wrap="nowrap" align="flex-start">
                            <MantineIcon
                                icon={IconSparkles}
                                size="md"
                                color="ldGray.6"
                            />
                            <Stack gap={0}>
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

                <Group mt="md" justify="space-between">
                    <Group gap="sm">
                        {(canManage || canCreate) && (
                            <Button
                                leftSection={<MantineIcon icon={IconSend} />}
                                onClick={() => setIsConfirmSendNowOpen(true)}
                                loading={sendNowMutation.isLoading}
                            >
                                Send now
                            </Button>
                        )}
                        {canManage && (
                            <Button
                                variant="default"
                                leftSection={<MantineIcon icon={IconPencil} />}
                                onClick={() => onEdit(scheduler.schedulerUuid)}
                            >
                                Edit
                            </Button>
                        )}
                    </Group>
                    {canManage && (
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
                    )}
                </Group>
            </Stack>

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

export const SchedulerListV2: FC<Props> = ({
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
