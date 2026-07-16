import {
    Alert,
    Badge,
    Button,
    Collapse,
    Divider,
    Group,
    Paper,
    SimpleGrid,
    Stack,
    Text,
    ThemeIcon,
    Timeline,
} from '@mantine-8/core';
import {
    IconAlertCircle,
    IconCheck,
    IconClock,
    IconFileSearch,
    IconPlayerStop,
    IconPlugConnected,
    IconReportSearch,
} from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { formatDuration } from '../../../../../utils/formatters';
import {
    DEEP_RESEARCH_DEPTH_CONFIG,
    isDeepResearchRunTerminal,
} from '../../deepResearch/deepResearchAdapter';
import { type DeepResearchRunView } from '../../deepResearch/types';
import { useCancelDeepResearchMutation } from '../../hooks/useDeepResearch';
import { DeepResearchReport } from './DeepResearchReport';
import styles from './DeepResearchRunCard.module.css';

const STATUS_CONFIG: Record<
    DeepResearchRunView['status'],
    { label: string; color: string }
> = {
    queued: { label: 'Queued', color: 'gray' },
    running: { label: 'Running', color: 'indigo' },
    waiting_for_permission: {
        label: 'Waiting for permission',
        color: 'yellow',
    },
    waiting_for_reconnection: {
        label: 'Waiting for reconnection',
        color: 'yellow',
    },
    completed: { label: 'Completed', color: 'green' },
    partially_completed: { label: 'Partially completed', color: 'yellow' },
    failed: { label: 'Failed', color: 'red' },
    cancelled: { label: 'Cancelled', color: 'gray' },
};

const getElapsedLabel = (elapsedMs: number) => {
    return formatDuration(Math.max(0, elapsedMs));
};

type Props = {
    run: DeepResearchRunView;
    projectUuid: string;
    onReconnect?: (integrationName?: string) => void;
    onContinueWithoutSource?: (integrationName?: string) => void;
    onAskFollowUp?: () => void;
    onChallenge?: () => void;
    onRerun?: () => void;
};

export const DeepResearchRunCard = ({
    run,
    projectUuid,
    onReconnect,
    onContinueWithoutSource,
    onAskFollowUp,
    onChallenge,
    onRerun,
}: Props) => {
    const status = STATUS_CONFIG[run.status];
    const cancelMutation = useCancelDeepResearchMutation(projectUuid, run.uuid);
    const [isActivityOpen, setIsActivityOpen] = useState(false);
    const [isReportOpen, setIsReportOpen] = useState(false);
    const [announcedStatus, setAnnouncedStatus] = useState(run.status);

    useEffect(() => {
        if (announcedStatus !== run.status) {
            setAnnouncedStatus(run.status);
        }
    }, [announcedStatus, run.status]);

    const hasReport = !!run.artifact;
    const isTerminal = isDeepResearchRunTerminal(run.status);
    const isActionRequired = !!run.actionRequired;

    return (
        <Paper
            className={styles.card}
            p="lg"
            radius="md"
            aria-label="Deep research run"
        >
            <Stack gap="md">
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <Group align="flex-start" wrap="nowrap">
                        <ThemeIcon color="indigo" variant="light" radius="md">
                            <MantineIcon icon={IconReportSearch} size={18} />
                        </ThemeIcon>
                        <Stack gap={3}>
                            <Group gap="xs">
                                <Text
                                    size="xs"
                                    c="indigo"
                                    fw={700}
                                    tt="uppercase"
                                >
                                    Deep research
                                </Text>
                                <Badge
                                    size="xs"
                                    variant="light"
                                    color="gray"
                                    tt="none"
                                >
                                    {
                                        DEEP_RESEARCH_DEPTH_CONFIG[run.depth]
                                            .label
                                    }
                                </Badge>
                            </Group>
                            <Text fw={600}>{run.question}</Text>
                        </Stack>
                    </Group>
                    <Badge
                        color={status.color}
                        variant="light"
                        style={{ flexShrink: 0 }}
                    >
                        {status.label}
                    </Badge>
                </Group>

                <Text className={styles.liveRegion} aria-live="polite">
                    Research status changed to {status.label}
                </Text>

                <Divider />

                {run.phase && !isTerminal && (
                    <Group gap="xs" wrap="nowrap">
                        <ThemeIcon size="sm" color="indigo" variant="light">
                            <MantineIcon icon={IconFileSearch} size={13} />
                        </ThemeIcon>
                        <Text size="sm" fw={600}>
                            {run.phase}
                        </Text>
                    </Group>
                )}

                <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
                    <Stack gap={2}>
                        <Text size="xs" c="dimmed">
                            Elapsed
                        </Text>
                        <Group gap={5}>
                            <IconClock size={13} />
                            <Text size="sm" ff="monospace">
                                {getElapsedLabel(run.elapsedMs)}
                            </Text>
                        </Group>
                    </Stack>
                    <Stack gap={2}>
                        <Text size="xs" c="dimmed">
                            Sources
                        </Text>
                        <Text size="sm" fw={600}>
                            {run.sourceCount ?? '—'}
                        </Text>
                    </Stack>
                    <Stack gap={2}>
                        <Text size="xs" c="dimmed">
                            Queries
                        </Text>
                        <Text size="sm" fw={600}>
                            {run.queryCount}
                        </Text>
                    </Stack>
                    <Stack gap={2}>
                        <Text size="xs" c="dimmed">
                            Findings
                        </Text>
                        <Text size="sm" fw={600}>
                            {run.findingCount}
                        </Text>
                    </Stack>
                </SimpleGrid>

                {isActionRequired &&
                    run.actionRequired &&
                    (onReconnect || onContinueWithoutSource) && (
                        <Alert
                            color="yellow"
                            icon={<IconPlugConnected size={16} />}
                        >
                            <Stack gap="sm">
                                <Text size="sm">
                                    {run.actionRequired.message}
                                </Text>
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
                                            {run.actionRequired
                                                .integrationName ?? 'source'}
                                        </Button>
                                    )}
                                </Group>
                            </Stack>
                        </Alert>
                    )}

                {run.status === 'failed' && (
                    <Alert color="red" icon={<IconAlertCircle size={16} />}>
                        <Text size="sm">
                            {run.errorMessage ??
                                'The investigation stopped before a report could be completed.'}
                        </Text>
                        <Text size="sm" mt="xs">
                            Completed queries and partial findings remain
                            available below. You can rerun the question after
                            resolving the issue.
                        </Text>
                    </Alert>
                )}

                {run.status === 'partially_completed' && (
                    <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
                        The report is incomplete, but all validated findings and
                        completed queries have been preserved.
                    </Alert>
                )}

                {hasReport && (
                    <Paper className={styles.answer} p="md" radius="sm">
                        <Stack gap="xs">
                            <Group gap="xs">
                                <MantineIcon
                                    icon={IconCheck}
                                    size={16}
                                    color="green.6"
                                />
                                <Text size="sm" fw={700}>
                                    Executive answer
                                </Text>
                            </Group>
                            <Text size="sm" lineClamp={5}>
                                {run.artifact?.executiveAnswer}
                            </Text>
                            <Button
                                variant="light"
                                size="xs"
                                w="fit-content"
                                onClick={() => setIsReportOpen(true)}
                            >
                                Open full report
                            </Button>
                        </Stack>
                    </Paper>
                )}

                {run.latestEvents.length > 0 && (
                    <>
                        <Button
                            variant="subtle"
                            size="xs"
                            w="fit-content"
                            onClick={() => setIsActivityOpen((open) => !open)}
                            aria-expanded={isActivityOpen}
                        >
                            {isActivityOpen ? 'Hide activity' : 'View activity'}
                        </Button>
                        <Collapse in={isActivityOpen}>
                            <Timeline bulletSize={16} lineWidth={1}>
                                {run.latestEvents.map((event) => (
                                    <Timeline.Item
                                        key={event.uuid}
                                        title={event.label}
                                    >
                                        <Text size="xs" c="dimmed">
                                            {new Date(
                                                event.createdAt,
                                            ).toLocaleTimeString([], {
                                                hour: '2-digit',
                                                minute: '2-digit',
                                            })}
                                        </Text>
                                    </Timeline.Item>
                                ))}
                            </Timeline>
                        </Collapse>
                    </>
                )}

                <Divider />
                <Group justify="space-between" align="center">
                    <Text size="xs" c="dimmed">
                        {isTerminal
                            ? 'This run is saved in this thread.'
                            : 'You can leave this page while research continues.'}
                    </Text>
                    {!isTerminal && (
                        <Button
                            variant="subtle"
                            color="red"
                            size="xs"
                            leftSection={<IconPlayerStop size={14} />}
                            loading={cancelMutation.isLoading}
                            onClick={() => cancelMutation.mutate()}
                        >
                            Stop research
                        </Button>
                    )}
                </Group>
            </Stack>

            <DeepResearchReport
                run={run}
                opened={isReportOpen}
                onClose={() => setIsReportOpen(false)}
                onAskFollowUp={onAskFollowUp}
                onChallenge={onChallenge}
                onRerun={onRerun}
            />
        </Paper>
    );
};
