import {
    Badge,
    Box,
    Button,
    Divider,
    Drawer,
    Group,
    Paper,
    ScrollArea,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import { useMediaQuery } from '@mantine-8/hooks';
import {
    IconArrowUpRight,
    IconMessageQuestion,
    IconRefresh,
    IconScale,
    IconShare,
} from '@tabler/icons-react';
import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type KeyboardEvent,
} from 'react';
import {
    type DeepResearchEvidence,
    type DeepResearchRunView,
} from '../../deepResearch/types';
import styles from './DeepResearchReport.module.css';

const EvidenceDetail = ({ evidence }: { evidence: DeepResearchEvidence }) => (
    <Stack gap="md" data-testid="evidence-detail">
        <Stack gap={4}>
            <Text size="xs" c="indigo" fw={700} tt="uppercase">
                {evidence.sourceLabel}
            </Text>
            <Title order={4}>{evidence.title}</Title>
            <Text size="sm">{evidence.description}</Text>
        </Stack>
        {evidence.queryUuid && (
            <Stack gap="xs">
                <Text size="xs" c="dimmed">
                    Query UUID
                </Text>
                <Text size="xs" ff="monospace" className={styles.reference}>
                    {evidence.queryUuid}
                </Text>
                {evidence.metrics.length > 0 && (
                    <Text size="sm">
                        <Text span fw={600}>
                            Metrics:{' '}
                        </Text>
                        {evidence.metrics.join(', ')}
                    </Text>
                )}
                {evidence.filters.length > 0 && (
                    <Text size="sm">
                        <Text span fw={600}>
                            Filters:{' '}
                        </Text>
                        {evidence.filters.join(', ')}
                    </Text>
                )}
                {evidence.dateRange && (
                    <Text size="sm">
                        <Text span fw={600}>
                            Date range:{' '}
                        </Text>
                        {evidence.dateRange}
                    </Text>
                )}
            </Stack>
        )}
        {evidence.sourceUrl && (
            <Button
                component="a"
                href={evidence.sourceUrl}
                target="_blank"
                rel="noreferrer"
                variant="light"
                rightSection={<IconArrowUpRight size={14} />}
            >
                {evidence.queryUuid ? 'Open in Lightdash' : 'Open source'}
            </Button>
        )}
    </Stack>
);

type Props = {
    run: DeepResearchRunView;
    opened: boolean;
    onClose: () => void;
    onAskFollowUp?: () => void;
    onChallenge?: () => void;
    onRerun?: () => void;
};

export const DeepResearchReport = ({
    run,
    opened,
    onClose,
    onAskFollowUp,
    onChallenge,
    onRerun,
}: Props) => {
    const isNarrow = useMediaQuery('(max-width: 62em)');
    const artifact = run.artifact;
    const allEvidence = useMemo(
        () => artifact?.findings.flatMap((finding) => finding.evidence) ?? [],
        [artifact],
    );
    const [selectedEvidenceUuid, setSelectedEvidenceUuid] = useState<
        string | null
    >(null);
    const selectedEvidence =
        allEvidence.find((item) => item.uuid === selectedEvidenceUuid) ?? null;
    const [isMobileEvidenceOpen, setIsMobileEvidenceOpen] = useState(false);
    const lastMarkerRef = useRef<HTMLButtonElement | null>(null);
    const markerRefs = useRef(new Map<string, HTMLButtonElement>());
    const evidenceRailId = `deep-research-evidence-${run.uuid}`;

    useEffect(() => {
        if (!opened) {
            setSelectedEvidenceUuid(null);
            setIsMobileEvidenceOpen(false);
        }
    }, [opened]);

    if (!artifact) {
        return null;
    }

    const selectEvidence = (
        evidence: DeepResearchEvidence,
        marker: HTMLButtonElement,
    ) => {
        lastMarkerRef.current = marker;
        setSelectedEvidenceUuid(evidence.uuid);
        if (isNarrow) {
            setIsMobileEvidenceOpen(true);
        }
    };

    const closeMobileEvidence = () => {
        setIsMobileEvidenceOpen(false);
        window.requestAnimationFrame(() => lastMarkerRef.current?.focus());
    };

    const handleMarkerKeyDown = (
        event: KeyboardEvent<HTMLButtonElement>,
        evidence: DeepResearchEvidence,
    ) => {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') {
            return;
        }
        event.preventDefault();
        const currentIndex = allEvidence.findIndex(
            (item) => item.uuid === evidence.uuid,
        );
        const direction = event.key === 'ArrowRight' ? 1 : -1;
        const nextIndex =
            (currentIndex + direction + allEvidence.length) %
            allEvidence.length;
        const nextEvidence = allEvidence[nextIndex];
        const nextMarker = nextEvidence
            ? markerRefs.current.get(nextEvidence.uuid)
            : undefined;
        if (!nextEvidence || !nextMarker) {
            return;
        }
        selectEvidence(nextEvidence, nextMarker);
        nextMarker.focus();
    };

    const handleShare = async () => {
        const shareData = {
            title: `Deep research: ${run.question}`,
            text: artifact.executiveAnswer,
            url: window.location.href,
        };
        try {
            if (navigator.share) {
                await navigator.share(shareData);
                return;
            }
            await navigator.clipboard?.writeText(window.location.href);
        } catch {
            // Cancelling the platform share sheet should leave the report open.
        }
    };

    return (
        <Drawer
            opened={opened}
            onClose={onClose}
            title="Research report"
            position="right"
            size="100%"
            padding={0}
        >
            <Box className={styles.workspace}>
                <ScrollArea className={styles.reportScroll}>
                    <Stack className={styles.report} gap="xl">
                        <Stack gap="xs">
                            <Group justify="space-between" align="flex-start">
                                <Stack gap={4}>
                                    <Text
                                        size="xs"
                                        c="indigo"
                                        fw={700}
                                        tt="uppercase"
                                    >
                                        Deep research
                                    </Text>
                                    <Title order={2}>{run.question}</Title>
                                </Stack>
                                <Badge variant="light" color="indigo">
                                    {artifact.confidence} confidence
                                </Badge>
                            </Group>
                            <Text size="lg" lh={1.6}>
                                {artifact.executiveAnswer}
                            </Text>
                        </Stack>

                        <Divider />

                        <Stack gap="lg">
                            <Title order={3}>Key findings</Title>
                            {artifact.findings.map((finding, findingIndex) => (
                                <Paper
                                    key={finding.uuid}
                                    className={styles.finding}
                                    p="lg"
                                    radius="md"
                                >
                                    <Stack gap="sm">
                                        <Group
                                            justify="space-between"
                                            align="flex-start"
                                        >
                                            <Title order={4}>
                                                {finding.title}
                                            </Title>
                                            <Badge size="sm" variant="outline">
                                                {finding.confidence}
                                            </Badge>
                                        </Group>
                                        <Text size="sm" lh={1.6}>
                                            {finding.summary}
                                        </Text>
                                        {finding.evidence.length > 0 && (
                                            <Group
                                                gap="xs"
                                                aria-label={`Evidence for ${finding.title}`}
                                            >
                                                {finding.evidence.map(
                                                    (
                                                        evidence,
                                                        evidenceIndex,
                                                    ) => {
                                                        const markerNumber =
                                                            artifact.findings
                                                                .slice(
                                                                    0,
                                                                    findingIndex,
                                                                )
                                                                .reduce(
                                                                    (
                                                                        count,
                                                                        item,
                                                                    ) =>
                                                                        count +
                                                                        item
                                                                            .evidence
                                                                            .length,
                                                                    0,
                                                                ) +
                                                            evidenceIndex +
                                                            1;
                                                        return (
                                                            <button
                                                                key={
                                                                    evidence.uuid
                                                                }
                                                                type="button"
                                                                className={
                                                                    styles.marker
                                                                }
                                                                data-selected={
                                                                    selectedEvidenceUuid ===
                                                                    evidence.uuid
                                                                }
                                                                aria-label={`Evidence ${markerNumber}: ${evidence.title}`}
                                                                aria-pressed={
                                                                    selectedEvidenceUuid ===
                                                                    evidence.uuid
                                                                }
                                                                aria-controls={
                                                                    evidenceRailId
                                                                }
                                                                ref={(
                                                                    element,
                                                                ) => {
                                                                    if (
                                                                        element
                                                                    ) {
                                                                        markerRefs.current.set(
                                                                            evidence.uuid,
                                                                            element,
                                                                        );
                                                                    } else {
                                                                        markerRefs.current.delete(
                                                                            evidence.uuid,
                                                                        );
                                                                    }
                                                                }}
                                                                onClick={(
                                                                    event,
                                                                ) =>
                                                                    selectEvidence(
                                                                        evidence,
                                                                        event.currentTarget,
                                                                    )
                                                                }
                                                                onKeyDown={(
                                                                    event,
                                                                ) =>
                                                                    handleMarkerKeyDown(
                                                                        event,
                                                                        evidence,
                                                                    )
                                                                }
                                                            >
                                                                {markerNumber}
                                                            </button>
                                                        );
                                                    },
                                                )}
                                            </Group>
                                        )}
                                    </Stack>
                                </Paper>
                            ))}
                        </Stack>

                        <Stack gap="md">
                            <Title order={3}>
                                Alternative explanations and contradictory
                                evidence
                            </Title>
                            {artifact.contradictoryEvidence.length ? (
                                artifact.contradictoryEvidence.map((item) => (
                                    <Text key={item} size="sm">
                                        • {item}
                                    </Text>
                                ))
                            ) : (
                                <Text size="sm" c="dimmed">
                                    No material contradictory evidence was
                                    found.
                                </Text>
                            )}
                        </Stack>

                        <Stack gap="md">
                            <Title order={3}>Definitions and methodology</Title>
                            <Text size="sm" lh={1.6}>
                                {artifact.definitionsAndMethodology}
                            </Text>
                        </Stack>

                        <Stack gap="md">
                            <Title order={3}>Confidence and limitations</Title>
                            {artifact.limitations.map((limitation) => (
                                <Text key={limitation} size="sm">
                                    • {limitation}
                                </Text>
                            ))}
                        </Stack>

                        <Stack gap="md">
                            <Title order={3}>Recommended next questions</Title>
                            {artifact.nextQuestions.map((question) => (
                                <Text key={question} size="sm">
                                    • {question}
                                </Text>
                            ))}
                        </Stack>

                        <Group className={styles.actions} gap="xs">
                            {onAskFollowUp && (
                                <Button
                                    variant="light"
                                    leftSection={
                                        <IconMessageQuestion size={16} />
                                    }
                                    onClick={onAskFollowUp}
                                >
                                    Ask a follow-up
                                </Button>
                            )}
                            {onChallenge && (
                                <Button
                                    variant="default"
                                    leftSection={<IconScale size={16} />}
                                    onClick={onChallenge}
                                >
                                    Challenge this finding
                                </Button>
                            )}
                            {onRerun && (
                                <Button
                                    variant="default"
                                    leftSection={<IconRefresh size={16} />}
                                    onClick={onRerun}
                                >
                                    Rerun with more depth
                                </Button>
                            )}
                            <Button
                                variant="subtle"
                                leftSection={<IconShare size={16} />}
                                onClick={() => void handleShare()}
                            >
                                Share report
                            </Button>
                        </Group>
                    </Stack>
                </ScrollArea>

                {!isNarrow && (
                    <aside
                        id={evidenceRailId}
                        className={styles.evidenceRail}
                        aria-label="Supporting evidence"
                        aria-live="polite"
                    >
                        <ScrollArea h="100%">
                            <Stack p="lg" gap="lg">
                                <Stack gap={4}>
                                    <Text fw={700}>Evidence</Text>
                                    <Text size="xs" c="dimmed">
                                        Select a numbered marker to inspect the
                                        source.
                                    </Text>
                                </Stack>
                                {selectedEvidence ? (
                                    <EvidenceDetail
                                        evidence={selectedEvidence}
                                    />
                                ) : (
                                    <Paper variant="dotted" p="md">
                                        <Text size="sm" c="dimmed">
                                            No evidence selected.
                                        </Text>
                                    </Paper>
                                )}
                            </Stack>
                        </ScrollArea>
                    </aside>
                )}
            </Box>

            {isNarrow && (
                <Drawer
                    opened={isMobileEvidenceOpen}
                    onClose={closeMobileEvidence}
                    title="Supporting evidence"
                    position="bottom"
                    size="85%"
                    trapFocus
                >
                    {selectedEvidence && (
                        <EvidenceDetail evidence={selectedEvidence} />
                    )}
                </Drawer>
            )}
        </Drawer>
    );
};
