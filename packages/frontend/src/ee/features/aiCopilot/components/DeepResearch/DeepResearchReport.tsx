import {
    Badge,
    Box,
    Button,
    Divider,
    Drawer,
    Group,
    ScrollArea,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import { IconArrowUpRight } from '@tabler/icons-react';
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

const EvidenceDetail = ({
    evidence,
    number,
    isSelected,
    elementRef,
}: {
    evidence: DeepResearchEvidence;
    number: number;
    isSelected: boolean;
    elementRef: (element: HTMLElement | null) => void;
}) => (
    <Box
        component="li"
        id={`deep-research-evidence-${evidence.uuid}`}
        className={styles.evidenceItem}
        data-selected={isSelected}
        data-testid={`evidence-detail-${evidence.uuid}`}
        tabIndex={-1}
        ref={elementRef}
    >
        <Text className={styles.evidenceNumber} aria-hidden>
            {number}
        </Text>
        <Stack gap="xs">
            <Stack gap={2}>
                <Text className={styles.eyebrow}>{evidence.sourceLabel}</Text>
                <Title order={4} className={styles.evidenceTitle}>
                    {evidence.title}
                </Title>
                <Text className={styles.bodyText}>{evidence.description}</Text>
            </Stack>
            {evidence.queryUuid && (
                <Stack gap={4}>
                    <Text className={styles.caption}>Query UUID</Text>
                    <Text ff="monospace" className={styles.reference}>
                        {evidence.queryUuid}
                    </Text>
                    {evidence.metrics.length > 0 && (
                        <Text className={styles.caption}>
                            <Text span fw={600} inherit>
                                Metrics:{' '}
                            </Text>
                            {evidence.metrics.join(', ')}
                        </Text>
                    )}
                    {evidence.filters.length > 0 && (
                        <Text className={styles.caption}>
                            <Text span fw={600} inherit>
                                Filters:{' '}
                            </Text>
                            {evidence.filters.join(', ')}
                        </Text>
                    )}
                    {evidence.dateRange && (
                        <Text className={styles.caption}>
                            <Text span fw={600} inherit>
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
                    variant="subtle"
                    size="compact-xs"
                    w="fit-content"
                    rightSection={<IconArrowUpRight size={13} />}
                >
                    {evidence.queryUuid ? 'Open in Lightdash' : 'Open source'}
                </Button>
            )}
        </Stack>
    </Box>
);

type Props = {
    run: DeepResearchRunView;
    opened: boolean;
    onClose: () => void;
};

export const DeepResearchReport = ({ run, opened, onClose }: Props) => {
    const artifact = run.artifact;
    const numberedEvidence = useMemo(
        () =>
            artifact?.findings
                .flatMap((finding) => finding.evidence)
                .map((evidence, index) => ({ evidence, number: index + 1 })) ??
            [],
        [artifact],
    );
    const [selectedEvidenceUuid, setSelectedEvidenceUuid] = useState<
        string | null
    >(null);
    const markerRefs = useRef(new Map<string, HTMLButtonElement>());
    const evidenceRefs = useRef(new Map<string, HTMLElement>());

    useEffect(() => {
        if (!opened) {
            setSelectedEvidenceUuid(null);
        }
    }, [opened]);

    if (!artifact) {
        return null;
    }

    const selectEvidence = (evidence: DeepResearchEvidence) => {
        setSelectedEvidenceUuid(evidence.uuid);
        window.requestAnimationFrame(() => {
            evidenceRefs.current.get(evidence.uuid)?.focus();
        });
    };

    const handleMarkerKeyDown = (
        event: KeyboardEvent<HTMLButtonElement>,
        evidence: DeepResearchEvidence,
    ) => {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') {
            return;
        }
        event.preventDefault();
        const currentIndex = numberedEvidence.findIndex(
            (item) => item.evidence.uuid === evidence.uuid,
        );
        const direction = event.key === 'ArrowRight' ? 1 : -1;
        const nextIndex =
            (currentIndex + direction + numberedEvidence.length) %
            numberedEvidence.length;
        const nextEvidence = numberedEvidence[nextIndex]?.evidence;
        const nextMarker = nextEvidence
            ? markerRefs.current.get(nextEvidence.uuid)
            : undefined;
        if (!nextEvidence || !nextMarker) {
            return;
        }
        setSelectedEvidenceUuid(nextEvidence.uuid);
        nextMarker.focus();
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
            <ScrollArea className={styles.reportScroll}>
                <Box component="article" className={styles.report}>
                    <Stack gap="xl">
                        <Box component="header" className={styles.reportHeader}>
                            <Group justify="space-between" align="flex-start">
                                <Text className={styles.eyebrow}>
                                    Deep research report
                                </Text>
                                <Badge
                                    size="xs"
                                    variant="light"
                                    color="indigo"
                                    tt="none"
                                >
                                    {artifact.confidence} confidence
                                </Badge>
                            </Group>
                            <Title order={1} className={styles.reportTitle}>
                                {run.question}
                            </Title>
                            <Text className={styles.executiveAnswer}>
                                {artifact.executiveAnswer}
                            </Text>
                        </Box>

                        <Divider />

                        <Box component="section" className={styles.section}>
                            <Title order={2} className={styles.sectionTitle}>
                                Key findings
                            </Title>
                            <Stack gap={0}>
                                {artifact.findings.map(
                                    (finding, findingIndex) => (
                                        <Box
                                            component="section"
                                            key={finding.uuid}
                                            className={styles.finding}
                                        >
                                            <Group
                                                justify="space-between"
                                                align="baseline"
                                                gap="md"
                                            >
                                                <Title
                                                    order={3}
                                                    className={
                                                        styles.findingTitle
                                                    }
                                                >
                                                    {finding.title}
                                                </Title>
                                                <Text
                                                    className={styles.caption}
                                                    tt="capitalize"
                                                >
                                                    {finding.confidence}
                                                </Text>
                                            </Group>
                                            <Text className={styles.bodyText}>
                                                {finding.summary}
                                            </Text>
                                            {finding.evidence.length > 0 && (
                                                <Group
                                                    gap={3}
                                                    mt="xs"
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
                                                                    aria-controls={`deep-research-evidence-${evidence.uuid}`}
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
                                                                    onClick={() =>
                                                                        selectEvidence(
                                                                            evidence,
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
                                                                    [
                                                                    {
                                                                        markerNumber
                                                                    }
                                                                    ]
                                                                </button>
                                                            );
                                                        },
                                                    )}
                                                </Group>
                                            )}
                                        </Box>
                                    ),
                                )}
                            </Stack>
                        </Box>

                        <Box component="section" className={styles.section}>
                            <Title order={2} className={styles.sectionTitle}>
                                Alternative explanations and contradictory
                                evidence
                            </Title>
                            {artifact.contradictoryEvidence.length ? (
                                <Box component="ul" className={styles.list}>
                                    {artifact.contradictoryEvidence.map(
                                        (item) => (
                                            <Text
                                                component="li"
                                                key={item}
                                                className={styles.bodyText}
                                            >
                                                {item}
                                            </Text>
                                        ),
                                    )}
                                </Box>
                            ) : (
                                <Text className={styles.bodyText} c="dimmed">
                                    No material contradictory evidence was
                                    found.
                                </Text>
                            )}
                        </Box>

                        <Box component="section" className={styles.section}>
                            <Title order={2} className={styles.sectionTitle}>
                                Definitions and methodology
                            </Title>
                            <Text className={styles.bodyText}>
                                {artifact.definitionsAndMethodology}
                            </Text>
                        </Box>

                        <Box component="section" className={styles.section}>
                            <Title order={2} className={styles.sectionTitle}>
                                Confidence and limitations
                            </Title>
                            <Box component="ul" className={styles.list}>
                                {artifact.limitations.map((limitation) => (
                                    <Text
                                        component="li"
                                        key={limitation}
                                        className={styles.bodyText}
                                    >
                                        {limitation}
                                    </Text>
                                ))}
                            </Box>
                        </Box>

                        <Box component="section" className={styles.section}>
                            <Title order={2} className={styles.sectionTitle}>
                                Recommended next questions
                            </Title>
                            <Box component="ul" className={styles.list}>
                                {artifact.nextQuestions.map((question) => (
                                    <Text
                                        component="li"
                                        key={question}
                                        className={styles.bodyText}
                                    >
                                        {question}
                                    </Text>
                                ))}
                            </Box>
                        </Box>

                        {numberedEvidence.length > 0 && (
                            <Box
                                component="section"
                                className={styles.section}
                                aria-labelledby="deep-research-evidence-title"
                            >
                                <Divider mb="xl" />
                                <Title
                                    order={2}
                                    id="deep-research-evidence-title"
                                    className={styles.sectionTitle}
                                >
                                    Evidence
                                </Title>
                                <Text className={styles.sectionIntro}>
                                    Sources cited in the findings above.
                                </Text>
                                <Box
                                    component="ol"
                                    className={styles.evidenceList}
                                >
                                    {numberedEvidence.map(
                                        ({ evidence, number }) => (
                                            <EvidenceDetail
                                                key={evidence.uuid}
                                                evidence={evidence}
                                                number={number}
                                                isSelected={
                                                    selectedEvidenceUuid ===
                                                    evidence.uuid
                                                }
                                                elementRef={(element) => {
                                                    if (element) {
                                                        evidenceRefs.current.set(
                                                            evidence.uuid,
                                                            element,
                                                        );
                                                    } else {
                                                        evidenceRefs.current.delete(
                                                            evidence.uuid,
                                                        );
                                                    }
                                                }}
                                            />
                                        ),
                                    )}
                                </Box>
                            </Box>
                        )}
                    </Stack>
                </Box>
            </ScrollArea>
        </Drawer>
    );
};
