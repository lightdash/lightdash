import {
    Alert,
    Box,
    Button,
    Collapse,
    Group,
    Paper,
    Stack,
    Text,
} from '@mantine/core';
import {
    IconAlertCircle,
    IconCheck,
    IconChevronDown,
    IconPlayerStop,
    IconPlugConnected,
    IconTelescope,
} from '@tabler/icons-react';
import {
    useEffect,
    useId,
    useState,
    type AnchorHTMLAttributes,
    type FC,
    type ReactNode,
} from 'react';
import { Link } from 'react-router';
import { type StreamdownProps } from 'streamdown';
import { AiMarkdown } from '../../../../../components/common/AiMarkdown';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { DeepResearchBetaBadge } from '../../deepResearch/DeepResearchBetaBadge';
import {
    getDeepResearchReportPreview,
    isDeepResearchRunTerminal,
} from '../../deepResearch/runProgress';
import { type DeepResearchRunView } from '../../deepResearch/types';
import {
    useCancelDeepResearchMutation,
    useTrackDeepResearchReportEngagement,
} from '../../hooks/useDeepResearch';
import styles from './DeepResearchRunCard.module.css';

const PreviewLink: FC<AnchorHTMLAttributes<HTMLAnchorElement>> = ({
    children,
}) => <span>{children as ReactNode}</span>;

const PREVIEW_MARKDOWN_COMPONENTS: StreamdownProps['components'] = {
    a: PreviewLink as unknown as NonNullable<
        StreamdownProps['components']
    >['a'],
    img: () => null,
};

const STATUS_CONFIG: Record<DeepResearchRunView['status'], { label: string }> =
    {
        queued: { label: 'Queued' },
        running: { label: 'Running' },
        waiting_for_permission: {
            label: 'Permission required',
        },
        waiting_for_reconnection: {
            label: 'Reconnect required',
        },
        completed: { label: 'Completed' },
        partially_completed: { label: 'Partially completed' },
        failed: { label: 'Couldn’t complete' },
        cancelled: { label: 'Stopped' },
    };

const getElapsedLabel = (elapsedMs: number) => {
    const elapsedSeconds = Math.floor(Math.max(0, elapsedMs) / 1_000);
    if (elapsedSeconds < 60) {
        return `${elapsedSeconds}s`;
    }

    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
};

const useElapsedMs = (run: DeepResearchRunView, isTerminal: boolean) => {
    const [elapsed, setElapsed] = useState({
        runUuid: run.uuid,
        elapsedMs: run.elapsedMs,
    });

    useEffect(() => {
        setElapsed((currentElapsed) => ({
            runUuid: run.uuid,
            elapsedMs:
                currentElapsed.runUuid !== run.uuid || isTerminal
                    ? run.elapsedMs
                    : Math.max(currentElapsed.elapsedMs, run.elapsedMs),
        }));
    }, [isTerminal, run.elapsedMs, run.uuid]);

    useEffect(() => {
        if (isTerminal) {
            return undefined;
        }

        const interval = window.setInterval(() => {
            setElapsed((currentElapsed) => ({
                ...currentElapsed,
                elapsedMs: currentElapsed.elapsedMs + 1_000,
            }));
        }, 1_000);

        return () => window.clearInterval(interval);
    }, [isTerminal, run.uuid]);

    return elapsed.elapsedMs;
};

export const DeepResearchRunHeading = ({
    statusLabel,
    elapsedLabel,
    action,
}: {
    statusLabel: string;
    elapsedLabel?: string;
    action?: ReactNode;
}) => (
    <Group
        className={styles.header}
        justify="space-between"
        align="center"
        wrap="nowrap"
    >
        <Stack className={styles.headingGroup}>
            <Group className={styles.runMeta} gap="xs" wrap="wrap">
                <MantineIcon
                    icon={IconTelescope}
                    size={16}
                    stroke={1.8}
                    color="currentColor"
                    className={styles.metaText}
                />
                <Group gap="xs" align="baseline" wrap="nowrap">
                    <Text
                        size="xs"
                        fw={600}
                        ff="monospace"
                        tt="uppercase"
                        className={styles.eyebrow}
                    >
                        Deep research
                    </Text>
                    <DeepResearchBetaBadge />
                </Group>
                <Box className={styles.metaSeparator} />
                <Group className={styles.statusMeta} gap={6} wrap="nowrap">
                    <Text size="xs" className={styles.metaText}>
                        {statusLabel}
                    </Text>
                    {elapsedLabel && (
                        <>
                            <Text size="xs" className={styles.metaText}>
                                ·
                            </Text>
                            <Text size="xs" className={styles.metaText}>
                                {elapsedLabel}
                            </Text>
                        </>
                    )}
                </Group>
            </Group>
        </Stack>
        {action}
    </Group>
);

type Props = {
    run: DeepResearchRunView;
    projectUuid: string;
    canRunAgain?: boolean;
    onRunAgain?: () => void;
    onReconnect?: (integrationName?: string) => void;
    onContinueWithoutSource?: (integrationName?: string) => void;
};

export const DeepResearchRunCard = ({
    run,
    projectUuid,
    canRunAgain = false,
    onRunAgain,
    onReconnect,
    onContinueWithoutSource,
}: Props) => {
    const status = STATUS_CONFIG[run.status];
    const cancelMutation = useCancelDeepResearchMutation(projectUuid, run.uuid);
    const [isActivityOpen, setIsActivityOpen] = useState(false);
    const activityId = useId();
    const trackReportEngagement = useTrackDeepResearchReportEngagement();
    const [announcedStatus, setAnnouncedStatus] = useState(run.status);
    const hasNoRelevantData =
        run.status === 'failed' && run.terminalReason === 'no_relevant_data';
    const statusLabel = hasNoRelevantData ? 'No relevant data' : status.label;

    useEffect(() => {
        if (announcedStatus !== run.status) {
            setAnnouncedStatus(run.status);
        }
    }, [announcedStatus, run.status]);

    const hasReport = !!run.resultMarkdown;
    const isReportExpired = run.isReportExpired;
    const isTerminal = isDeepResearchRunTerminal(run.status);
    const elapsedMs = useElapsedMs(run, isTerminal);
    const isActionRequired = !!run.actionRequired;
    const canShowActionRequired =
        isActionRequired &&
        !!run.actionRequired &&
        !!(onReconnect || onContinueWithoutSource);
    const elapsedLabel = getElapsedLabel(elapsedMs);
    const isCompleted = run.status === 'completed';
    const completedStatusLabel = `${status.label} in ${elapsedLabel} · ${run.queryCount} ${run.queryCount === 1 ? 'query' : 'queries'} · ${run.findingCount} ${run.findingCount === 1 ? 'finding' : 'findings'}`;

    return (
        <Paper
            className={styles.card}
            p="lg"
            radius="md"
            aria-label="Deep research run"
        >
            <Stack gap="md">
                <DeepResearchRunHeading
                    statusLabel={
                        isCompleted ? completedStatusLabel : statusLabel
                    }
                    elapsedLabel={
                        run.status === 'queued' || isCompleted
                            ? undefined
                            : elapsedLabel
                    }
                    action={
                        !isTerminal ? (
                            <Button
                                className={styles.stopButton}
                                variant="subtle"
                                color="gray"
                                size="sm"
                                leftSection={<IconPlayerStop size={14} />}
                                loading={cancelMutation.isLoading}
                                onClick={() => cancelMutation.mutate()}
                            >
                                Stop research
                            </Button>
                        ) : undefined
                    }
                />

                <Text className={styles.liveRegion} aria-live="polite">
                    Research status changed to {statusLabel}
                </Text>

                {run.phase && !isTerminal && (
                    <Group gap="xs" wrap="nowrap" className={styles.phase}>
                        <Box className={styles.phaseDot} />
                        <Text size="sm" fw={500}>
                            {run.phase}
                        </Text>
                    </Group>
                )}

                {!isCompleted && (
                    <Group className={styles.metrics} gap="md" wrap="wrap">
                        <Group gap={5} wrap="nowrap">
                            <Text size="xs">Queries</Text>
                            <Text size="sm" fw={600} ff="monospace">
                                {run.queryCount}
                            </Text>
                        </Group>
                        <Group gap={5} wrap="nowrap">
                            <Text size="xs">Sources</Text>
                            <Text size="sm" fw={600} ff="monospace">
                                {run.sourceCount ?? '—'}
                            </Text>
                        </Group>
                        <Group gap={5} wrap="nowrap">
                            <Text size="xs">Findings</Text>
                            <Text size="sm" fw={600} ff="monospace">
                                {run.findingCount}
                            </Text>
                        </Group>
                    </Group>
                )}

                {!isTerminal && (
                    <Text size="xs" c="dimmed">
                        Research continues if you leave this page.
                    </Text>
                )}

                {canShowActionRequired && run.actionRequired && (
                    <Alert
                        color="yellow"
                        icon={<IconPlugConnected size={16} />}
                    >
                        <Stack gap="sm">
                            <Text size="sm">{run.actionRequired.message}</Text>
                            <Group gap="xs">
                                {onReconnect && (
                                    <Button
                                        size="xs"
                                        onClick={() =>
                                            onReconnect?.(
                                                run.actionRequired
                                                    ?.integrationName,
                                            )
                                        }
                                    >
                                        {run.actionRequired.type ===
                                        'permission'
                                            ? 'Review permissions'
                                            : `Reconnect ${run.actionRequired.integrationName ?? 'source'}`}
                                    </Button>
                                )}
                                {onContinueWithoutSource && (
                                    <Button
                                        size="xs"
                                        variant="default"
                                        onClick={() =>
                                            onContinueWithoutSource?.(
                                                run.actionRequired
                                                    ?.integrationName,
                                            )
                                        }
                                    >
                                        Continue without{' '}
                                        {run.actionRequired.integrationName ??
                                            'source'}
                                    </Button>
                                )}
                            </Group>
                        </Stack>
                    </Alert>
                )}

                {run.status === 'failed' && (
                    <Alert color="red" icon={<IconAlertCircle size={16} />}>
                        <Stack gap="sm">
                            <Text size="sm">
                                {run.errorMessage ??
                                    'Research stopped before the report was ready.'}
                            </Text>
                            {hasNoRelevantData ? (
                                <Text size="sm">
                                    Try refining your question or choosing data
                                    that covers the topic.
                                </Text>
                            ) : (
                                <>
                                    <Text size="sm">
                                        Any completed queries and findings are
                                        saved below.
                                    </Text>
                                    <Text size="sm">
                                        Starting over creates a new research
                                        run. Previous queries won&apos;t be
                                        reused.
                                    </Text>
                                </>
                            )}
                            {canRunAgain && onRunAgain && (
                                <Button
                                    size="xs"
                                    variant="default"
                                    w="fit-content"
                                    onClick={onRunAgain}
                                >
                                    Start over
                                </Button>
                            )}
                        </Stack>
                    </Alert>
                )}

                {run.status === 'partially_completed' && !isReportExpired && (
                    <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
                        This report is incomplete. Completed queries and
                        available findings are saved below.
                    </Alert>
                )}

                {isReportExpired && (
                    <Paper variant="dotted" p="md" radius="sm">
                        <Stack gap="xs">
                            <Text size="sm" fw={600}>
                                This report is no longer available.
                            </Text>
                            <Text size="sm" c="dimmed">
                                Deep Research reports are available for 30 days.
                            </Text>
                            <Text size="sm">{run.question}</Text>
                            {run.completedAt && (
                                <Text size="xs" c="dimmed">
                                    Completed{' '}
                                    {new Date(
                                        run.completedAt,
                                    ).toLocaleDateString()}
                                </Text>
                            )}
                            <Button
                                size="xs"
                                w="fit-content"
                                disabled={!canRunAgain || !onRunAgain}
                                onClick={onRunAgain}
                            >
                                Run research again
                            </Button>
                        </Stack>
                    </Paper>
                )}

                {hasReport && (
                    <Paper className={styles.answer} p="lg" radius="sm">
                        <Stack gap="md">
                            <Group gap="xs">
                                <MantineIcon
                                    icon={IconCheck}
                                    size={16}
                                    color="ldGray.6"
                                />
                                <Text size="sm" fw={600}>
                                    Research summary
                                </Text>
                            </Group>
                            {run.resultMarkdown && (
                                <AiMarkdown
                                    className={styles.answerPreview}
                                    components={PREVIEW_MARKDOWN_COMPONENTS}
                                >
                                    {getDeepResearchReportPreview(
                                        run.resultMarkdown,
                                    )}
                                </AiMarkdown>
                            )}
                            <Button
                                component={Link}
                                to={`/projects/${run.projectUuid}/ai-agents/deep-research/${run.uuid}`}
                                color="ldDark"
                                size="xs"
                                w="fit-content"
                                onClick={() => {
                                    if (
                                        run.status === 'completed' ||
                                        run.status === 'partially_completed' ||
                                        run.status === 'failed' ||
                                        run.status === 'cancelled'
                                    ) {
                                        trackReportEngagement('opened', {
                                            aiDeepResearchRunUuid: run.uuid,
                                            projectUuid: run.projectUuid,
                                            agentUuid: run.agentUuid,
                                            aiThreadUuid: run.threadUuid,
                                            status: run.status,
                                            completedAt: run.completedAt,
                                            updatedAt: run.updatedAt,
                                        });
                                    }
                                }}
                            >
                                View full report
                            </Button>
                        </Stack>
                    </Paper>
                )}

                {run.latestEvents.length > 0 && (
                    <Stack
                        gap="md"
                        className={styles.activitySection}
                        data-active={!isTerminal}
                    >
                        <Button
                            className={styles.activityButton}
                            variant="transparent"
                            color="gray"
                            size="xs"
                            w="fit-content"
                            px={0}
                            rightSection={
                                <MantineIcon
                                    icon={IconChevronDown}
                                    size={13}
                                    className={styles.activityChevron}
                                    data-open={isActivityOpen}
                                />
                            }
                            onClick={() => setIsActivityOpen((open) => !open)}
                            aria-expanded={isActivityOpen}
                            aria-controls={activityId}
                        >
                            {isActivityOpen ? 'Hide activity' : 'View activity'}
                        </Button>
                        <Collapse id={activityId} in={isActivityOpen}>
                            <Box
                                component="ul"
                                className={styles.timeline}
                                aria-label="Research activity"
                            >
                                {run.latestEvents.map((event, index) => (
                                    <Box
                                        component="li"
                                        key={event.uuid}
                                        className={styles.timelineItem}
                                        data-current={
                                            (isTerminal && index === 0) ||
                                            undefined
                                        }
                                    >
                                        <Text className={styles.eventTime}>
                                            {new Date(
                                                event.createdAt,
                                            ).toLocaleTimeString([], {
                                                hour: '2-digit',
                                                minute: '2-digit',
                                            })}
                                        </Text>
                                        <Box className={styles.timelineNode} />
                                        <Text className={styles.eventLabel}>
                                            {event.label}
                                        </Text>
                                    </Box>
                                ))}
                            </Box>
                        </Collapse>
                    </Stack>
                )}
            </Stack>
        </Paper>
    );
};
