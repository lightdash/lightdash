import { getDocumentUrl } from '@lightdash/common';
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
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { type StreamdownProps } from 'streamdown';
import { AiMarkdown } from '../../../../../components/common/AiMarkdown';
import MantineIcon from '../../../../../components/common/MantineIcon';
import i18n from '../../../../../i18n/i18n';
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
import { AiDocumentCardButton } from '../ChatElements/AiDocumentCardButton';
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

const STATUS_LABEL_KEYS: Record<DeepResearchRunView['status'], string> = {
    queued: 'deepResearch.status.queued',
    running: 'deepResearch.status.running',
    waiting_for_permission: 'deepResearch.status.waitingForPermission',
    waiting_for_reconnection: 'deepResearch.status.waitingForReconnection',
    completed: 'deepResearch.status.completed',
    partially_completed: 'deepResearch.status.partiallyCompleted',
    failed: 'deepResearch.status.failed',
    cancelled: 'deepResearch.status.cancelled',
};

const getElapsedLabel = (elapsedMs: number) => {
    const elapsedSeconds = Math.floor(Math.max(0, elapsedMs) / 1_000);
    if (elapsedSeconds < 60) {
        return i18n.t('deepResearch.elapsed.seconds', {
            ns: 'aiAgent',
            seconds: elapsedSeconds,
        });
    }

    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    return seconds > 0
        ? i18n.t('deepResearch.elapsed.minutesSeconds', {
              ns: 'aiAgent',
              minutes,
              seconds,
          })
        : i18n.t('deepResearch.elapsed.minutes', { ns: 'aiAgent', minutes });
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
}) => {
    const { t } = useTranslation('aiAgent');
    return (
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
                            {t('deepResearch.eyebrow')}
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
};

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
    const { t } = useTranslation('aiAgent');
    const status = { label: t(STATUS_LABEL_KEYS[run.status]) };
    const cancelMutation = useCancelDeepResearchMutation(projectUuid, run.uuid);
    const [isActivityOpen, setIsActivityOpen] = useState(false);
    const activityId = useId();
    const trackReportEngagement = useTrackDeepResearchReportEngagement();
    const [announcedStatus, setAnnouncedStatus] = useState(run.status);
    const hasNoRelevantData =
        run.status === 'failed' && run.terminalReason === 'no_relevant_data';
    const statusLabel = hasNoRelevantData
        ? t('deepResearch.status.noRelevantData')
        : status.label;

    useEffect(() => {
        if (announcedStatus !== run.status) {
            setAnnouncedStatus(run.status);
        }
    }, [announcedStatus, run.status]);

    const hasDocument = run.document !== null;
    const hasReport = !hasDocument && !!run.resultMarkdown;
    // A published Document outlives the run's report retention.
    const isReportExpired = !hasDocument && run.isReportExpired;
    const trackReportOpened = () => {
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
    };
    const isTerminal = isDeepResearchRunTerminal(run.status);
    const elapsedMs = useElapsedMs(run, isTerminal);
    const isActionRequired = !!run.actionRequired;
    const canShowActionRequired =
        isActionRequired &&
        !!run.actionRequired &&
        !!(onReconnect || onContinueWithoutSource);
    const elapsedLabel = getElapsedLabel(elapsedMs);
    const isCompleted = run.status === 'completed';
    const completedStatusLabel = t('deepResearch.completedSummary', {
        status: status.label,
        elapsed: elapsedLabel,
        queries: t('deepResearch.queryCount', { count: run.queryCount }),
        findings: t('deepResearch.findingCount', { count: run.findingCount }),
    });

    return (
        <Paper
            className={styles.card}
            p="lg"
            radius="md"
            aria-label={t('deepResearch.runAria')}
            // Walkthrough look at the run card once the thread opens.
            data-tour-scope="create:AiDeepResearch"
            data-tour-look="1"
            data-tour-after='[data-tour-anchor="agent-thread"][data-tour-value="Why returns rose in the spring"]'
            data-tour-label="The run card stays with the question"
            data-tour-docs="agents/deep-research.mdx#follow-progress:1"
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
                                {t('deepResearch.stop')}
                            </Button>
                        ) : undefined
                    }
                />

                <Text className={styles.liveRegion} aria-live="polite">
                    {t('deepResearch.statusChanged', { status: statusLabel })}
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
                            <Text size="xs">
                                {t('deepResearch.metrics.queries')}
                            </Text>
                            <Text size="sm" fw={600} ff="monospace">
                                {run.queryCount}
                            </Text>
                        </Group>
                        <Group gap={5} wrap="nowrap">
                            <Text size="xs">
                                {t('deepResearch.metrics.sources')}
                            </Text>
                            <Text size="sm" fw={600} ff="monospace">
                                {run.sourceCount ?? '—'}
                            </Text>
                        </Group>
                        <Group gap={5} wrap="nowrap">
                            <Text size="xs">
                                {t('deepResearch.metrics.findings')}
                            </Text>
                            <Text size="sm" fw={600} ff="monospace">
                                {run.findingCount}
                            </Text>
                        </Group>
                    </Group>
                )}

                {!isTerminal && (
                    <Text size="xs" c="dimmed">
                        {t('deepResearch.continuesInBackground')}
                    </Text>
                )}

                {canShowActionRequired && run.actionRequired && (
                    <Alert
                        color="orange"
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
                                            ? t(
                                                  'deepResearch.reviewPermissions',
                                              )
                                            : run.actionRequired.integrationName
                                              ? t(
                                                    'deepResearch.reconnectNamed',
                                                    {
                                                        name: run.actionRequired
                                                            .integrationName,
                                                    },
                                                )
                                              : t(
                                                    'deepResearch.reconnectSource',
                                                )}
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
                                        {run.actionRequired.integrationName
                                            ? t(
                                                  'deepResearch.continueWithoutNamed',
                                                  {
                                                      name: run.actionRequired
                                                          .integrationName,
                                                  },
                                              )
                                            : t(
                                                  'deepResearch.continueWithoutSource',
                                              )}
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
                                    t('deepResearch.stoppedBeforeReady')}
                            </Text>
                            {hasNoRelevantData ? (
                                <Text size="sm">
                                    {t('deepResearch.tryRefining')}
                                </Text>
                            ) : (
                                <>
                                    <Text size="sm">
                                        {t('deepResearch.completedSaved')}
                                    </Text>
                                    <Text size="sm">
                                        {t('deepResearch.startOverNote')}
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
                                    {t('deepResearch.startOver')}
                                </Button>
                            )}
                        </Stack>
                    </Alert>
                )}

                {run.status === 'partially_completed' && !isReportExpired && (
                    <Alert color="orange" icon={<IconAlertCircle size={16} />}>
                        {t('deepResearch.incomplete')}
                    </Alert>
                )}

                {isReportExpired && (
                    <Paper variant="dotted" p="md" radius="sm">
                        <Stack gap="xs">
                            <Text size="sm" fw={600}>
                                {t('deepResearch.expired')}
                            </Text>
                            <Text size="sm" c="dimmed">
                                {t('deepResearch.retention')}
                            </Text>
                            <Text size="sm">{run.question}</Text>
                            {run.completedAt && (
                                <Text size="xs" c="dimmed">
                                    {t('deepResearch.completedOn', {
                                        date: new Date(
                                            run.completedAt,
                                        ).toLocaleDateString(),
                                    })}
                                </Text>
                            )}
                            <Button
                                size="xs"
                                w="fit-content"
                                disabled={!canRunAgain || !onRunAgain}
                                onClick={onRunAgain}
                            >
                                {t('deepResearch.runAgain')}
                            </Button>
                        </Stack>
                    </Paper>
                )}

                {run.document && (
                    <AiDocumentCardButton
                        projectUuid={run.projectUuid}
                        agentUuid={run.agentUuid}
                        threadUuid={run.threadUuid}
                        messageUuid={run.promptUuid}
                        document={{
                            uuid: run.document.documentUuid,
                            name: run.document.name,
                            href: getDocumentUrl(
                                run.projectUuid,
                                run.document.documentUuid,
                                run.document.slug,
                            ),
                        }}
                        onOpen={trackReportOpened}
                    />
                )}

                {hasReport && (
                    <Paper className={styles.answer} p="lg" radius="sm">
                        <Stack gap="md">
                            <Group gap="xs">
                                <MantineIcon
                                    icon={IconCheck}
                                    size={16}
                                    color="dimmed"
                                />
                                <Text size="sm" fw={600}>
                                    {t('deepResearch.summary')}
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
                                // Anchor for scope walkthroughs (data-tour-via)
                                data-tour-anchor="research-report-open"
                                data-tour-hint="Open the full report"
                                onClick={trackReportOpened}
                            >
                                {t('deepResearch.viewFullReport')}
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
                            {isActivityOpen
                                ? t('deepResearch.hideActivity')
                                : t('deepResearch.viewActivity')}
                        </Button>
                        <Collapse id={activityId} expanded={isActivityOpen}>
                            <Box
                                component="ul"
                                className={styles.timeline}
                                aria-label={t('deepResearch.activityAria')}
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
