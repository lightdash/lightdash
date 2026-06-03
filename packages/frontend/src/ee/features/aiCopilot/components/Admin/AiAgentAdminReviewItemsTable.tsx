import {
    type AiAgentRecommendationAction,
    type AiAgentReviewItemStatus,
    type AiAgentReviewItemSummary,
    type AiAgentReviewSignalSummary,
    type AiAgentRootCause,
    type AiAgentTargetRef,
    type AiAgentTurnSignal,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Collapse,
    Divider,
    Group,
    Loader,
    Menu,
    SegmentedControl,
    Stack,
    Text,
    Tooltip,
    UnstyledButton,
    useMantineTheme,
} from '@mantine-8/core';
import {
    IconArrowRight,
    IconBox,
    IconChevronDown,
    IconChevronRight,
    IconCircleCheck,
    IconCircleDashed,
    IconClock,
    IconDots,
    IconExternalLink,
    IconFilterX,
    IconGitPullRequest,
    IconHelpCircle,
    IconInfoCircle,
    IconListCheck,
    IconMessages,
    IconRobotFace,
    IconTag,
    IconTriangle,
    IconX,
} from '@tabler/icons-react';
import {
    useCallback,
    useDeferredValue,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { CategoryBadge } from '../../../../../components/common/CategoryBadge';
import {
    ContentTable,
    useContentTable,
    type MRT_ColumnDef,
} from '../../../../../components/common/ContentTable';
import FilterFacet, {
    type FilterFacetOption,
} from '../../../../../components/common/FilterFacet';
import LinkButton from '../../../../../components/common/LinkButton';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useProjects } from '../../../../../hooks/useProjects';
import {
    useAiAgentAdminAgents,
    useAiAgentAdminReviewItem,
    useAiAgentAdminReviewItems,
    useAiAgentAdminReviewSignals,
    useCreateAiAgentReviewItemWriteback,
    useUpdateAiAgentReviewItemStatus,
} from '../../hooks/useAiAgentAdmin';
import { AgentNamePill } from '../AgentNamePill';
import styles from './AiAgentAdminReviewItemsTable.module.css';
import { SearchFilter } from './SearchFilter';

const ALL_REVIEW_ITEM_STATUSES: AiAgentReviewItemStatus[] = [
    'open',
    'in_progress',
    'resolved',
    'dismissed',
    'duplicate',
];

const rootCauseLabels: Record<AiAgentRootCause, string> = {
    semantic_layer: 'Semantic layer',
    project_context: 'Project context',
    agent_configuration: 'Agent config',
    data_gap: 'Data gap',
    product_capability: 'Product',
    runtime_reliability: 'Runtime',
    feedback_quality: 'Feedback',
    not_a_failure: 'Not failure',
    ambiguous: 'Ambiguous',
};

const rootCauseColors: Record<AiAgentRootCause, string> = {
    semantic_layer: 'indigo',
    project_context: 'violet',
    agent_configuration: 'cyan',
    data_gap: 'orange',
    product_capability: 'grape',
    runtime_reliability: 'red',
    feedback_quality: 'teal',
    not_a_failure: 'gray',
    ambiguous: 'gray',
};

const signalLabels: Record<AiAgentTurnSignal, string> = {
    normal_refinement: 'Normal refinement',
    implicit_correction: 'Implicit correction',
    explicit_dispute: 'Explicit dispute',
    retry_after_failure: 'Retry after failure',
    output_shape_correction: 'Output correction',
    new_question: 'New question',
    acceptance_or_continuation: 'Accepted',
    product_capability_request: 'Capability request',
    human_intervention: 'Human intervention',
    ambiguous: 'Ambiguous',
};

const actionLabels: Record<AiAgentRecommendationAction, string> = {
    update_semantic_yaml: 'Update semantic layer',
    update_agent_instructions: 'Update instructions',
    add_knowledge_document: 'Add knowledge doc',
    enable_data_access: 'Enable data access',
    enable_sql_mode: 'Enable SQL mode',
    enable_self_improvement: 'Enable self-improvement',
    configure_mcp_server: 'Configure MCP',
    adjust_explore_tags: 'Adjust explore tags',
    update_access: 'Update access',
    route_to_product_work: 'Route to product',
    request_more_evidence: 'Needs more evidence',
    no_action: 'No action',
};

const formatLastSeenDate = (date: Date): string => {
    const parsedDate = new Date(date);
    const now = new Date();
    const isCurrentYear = parsedDate.getFullYear() === now.getFullYear();

    return parsedDate.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        ...(!isCurrentYear && { year: 'numeric' }),
    });
};

type ReviewSurface = 'findings' | 'signals';

export type AiAgentAdminReviewItemPreviewTarget = {
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    reviewItemUuid?: string | null;
};

type AiAgentAdminReviewItemsTableProps = {
    selectedReviewItemUuid?: string | null;
    onReviewItemSelect?: (target: AiAgentAdminReviewItemPreviewTarget) => void;
};

const getTargetLabel = (targetRefs: AiAgentTargetRef[]): string | null => {
    const targetRef = targetRefs[0];
    if (!targetRef) return null;

    switch (targetRef.type) {
        case 'dimension':
            return `${targetRef.modelName}.${targetRef.dimensionName}`;
        case 'metric':
            return `${targetRef.modelName}.${targetRef.metricName}`;
        case 'model':
            return targetRef.modelName;
        case 'explore':
            return `${targetRef.modelName}.${targetRef.exploreName}`;
        case 'join':
            return `${targetRef.modelName}.${targetRef.joinName}`;
        case 'agent_config':
            return targetRef.setting.replaceAll('_', ' ');
        case 'product_capability':
            return targetRef.capabilityKey;
        case 'runtime':
            return targetRef.key;
        default:
            return null;
    }
};

const isTriageReviewItem = (reviewItem: AiAgentReviewItemSummary): boolean =>
    reviewItem.primaryRootCause === 'ambiguous' ||
    reviewItem.latestFinding?.fixTargets.includes('feedback_needed') === true;

const getIssueTitle = (reviewItem: AiAgentReviewItemSummary): string => {
    if (isTriageReviewItem(reviewItem)) {
        return 'Triage correction signal';
    }

    const targetLabel = getTargetLabel(
        reviewItem.latestFinding?.targetRefs ?? [],
    );
    if (targetLabel && reviewItem.primaryRootCause === 'semantic_layer') {
        return `Review ${targetLabel}`;
    }

    return reviewItem.latestFinding?.recommendation?.title ?? reviewItem.title;
};

const getWhatHappened = (reviewItem: AiAgentReviewItemSummary): string => {
    const evidence = reviewItem.latestFinding?.evidenceExcerpts ?? [];
    const correction =
        evidence.find((excerpt) => excerpt.source === 'next_user_prompt')
            ?.text ??
        evidence.find((excerpt) => excerpt.source === 'user_prompt')?.text;
    const assistantAnswer = evidence.find(
        (excerpt) => excerpt.source === 'assistant_answer',
    )?.text;

    if (correction && assistantAnswer) {
        return `User correction: ${correction}`;
    }

    return correction ?? reviewItem.description;
};

const getWhyText = (reviewItem: AiAgentReviewItemSummary): string => {
    if (isTriageReviewItem(reviewItem)) {
        return 'Could be a real failure or a normal change in user intent.';
    }

    return (
        reviewItem.latestFinding?.recommendation?.rationale ??
        `Review agent judged this as ${rootCauseLabels[reviewItem.primaryRootCause].toLowerCase()}.`
    );
};

const getActionLabel = (reviewItem: AiAgentReviewItemSummary): string => {
    const recommendation = reviewItem.latestFinding?.recommendation;
    if (recommendation) {
        return actionLabels[recommendation.actionType];
    }

    const fixTarget = reviewItem.latestFinding?.fixTargets[0];
    if (fixTarget) {
        return fixTarget.replaceAll('_', ' ');
    }

    return 'Review';
};

const getSuggestedNextStep = (reviewItem: AiAgentReviewItemSummary): string => {
    const action = getActionLabel(reviewItem);

    if (isTriageReviewItem(reviewItem)) {
        return 'Review the backing thread before deciding whether this is actionable.';
    }

    if (action === 'No action') {
        return 'No action suggested.';
    }

    return action;
};

const getSignalResultLabel = (signal: AiAgentReviewSignalSummary): string => {
    if (signal.finding) {
        return rootCauseLabels[signal.finding.primaryRootCause];
    }

    return signal.promotedToFinding ? 'Finding pending' : 'Signal only';
};

const getSignalWhyText = (signal: AiAgentReviewSignalSummary): string =>
    signal.promotionReason ??
    signal.finding?.recommendation?.rationale ??
    'The judge reviewed this turn but did not promote it into a review item.';

const getSignalActionText = (signal: AiAgentReviewSignalSummary): string => {
    if (signal.finding?.recommendation) {
        return actionLabels[signal.finding.recommendation.actionType];
    }

    if (signal.promotedToFinding) {
        return 'Review finding';
    }

    return 'No admin action';
};

const getConfidenceIcon = (
    confidence: AiAgentReviewSignalSummary['confidence'],
) => {
    switch (confidence) {
        case 'high':
            return IconCircleCheck;
        case 'medium':
            return IconCircleDashed;
        case 'low':
        default:
            return IconTriangle;
    }
};

const ExpandableText = ({
    children,
    lineClamp = 2,
    color = 'ldGray.6',
    size = 'xs',
    weight,
}: {
    children: string;
    lineClamp?: number;
    color?: string;
    size?: string;
    weight?: number;
}) => {
    const [expanded, setExpanded] = useState(false);
    const [isOverflowing, setIsOverflowing] = useState(false);
    const textRef = useRef<HTMLParagraphElement>(null);

    // Detect real truncation (which is width-dependent) instead of guessing
    // from character count, so a narrow column expands the same as a wide one.
    useEffect(() => {
        const element = textRef.current;
        if (!element) return;
        const measure = () =>
            setIsOverflowing(element.scrollHeight - element.clientHeight > 1);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, [children]);

    const canExpand = expanded || isOverflowing;

    return (
        <Text
            ref={textRef}
            fz={size}
            c={color}
            fw={weight}
            lineClamp={expanded ? undefined : lineClamp}
            className={canExpand ? styles.expandableText : undefined}
            onClick={(event) => {
                if (!canExpand) return;
                event.stopPropagation();
                setExpanded((isExpanded) => !isExpanded);
            }}
            title={
                canExpand
                    ? expanded
                        ? 'Click to collapse'
                        : 'Click to expand'
                    : undefined
            }
        >
            {children}
        </Text>
    );
};

const SuggestedStep = ({ children }: { children: string }) => (
    <Tooltip
        label={`Suggested next step: ${children}`}
        withArrow
        openDelay={300}
    >
        <Group gap={4} wrap="nowrap" className={styles.suggestedStep}>
            <MantineIcon
                icon={IconArrowRight}
                size="xs"
                className={styles.suggestedStepArrow}
            />
            <Text fz="xs" fw={600} c="ldGray.8" lineClamp={1}>
                {children}
            </Text>
        </Group>
    </Tooltip>
);

const ReviewConceptHelp = () => (
    <Tooltip
        label="Turn: one user prompt and assistant response. Signal: the judge's per-turn assessment. Finding: a promoted signal that needs admin review."
        withArrow
        multiline
        maw={320}
    >
        <Box className={styles.headerHelpIcon}>
            <MantineIcon icon={IconHelpCircle} color="ldGray.5" size="sm" />
        </Box>
    </Tooltip>
);

const statusColors: Record<AiAgentReviewItemStatus, string> = {
    open: 'gray',
    in_progress: 'yellow',
    resolved: 'green',
    dismissed: 'gray',
    duplicate: 'gray',
};

const FindingCell = ({
    reviewItem,
    onPreview,
}: {
    reviewItem: AiAgentReviewItemSummary;
    onPreview: (() => void) | null;
}) => {
    const [showReasoning, setShowReasoning] = useState(false);
    const contextEntry = reviewItem.latestFinding?.projectContextEntry ?? null;
    const reasoning = contextEntry
        ? `${
              contextEntry.op === 'update' ? 'Updates' : 'Adds'
          } project context: ${contextEntry.content}`
        : getWhyText(reviewItem);

    return (
        <Stack gap={2} miw={0}>
            <Text fw={600} fz="sm" c="ldGray.9" lineClamp={1}>
                {getIssueTitle(reviewItem)}
            </Text>
            <ExpandableText lineClamp={1}>
                {getWhatHappened(reviewItem)}
            </ExpandableText>
            <Group justify="space-between" wrap="nowrap" gap="xs" mt={2}>
                <UnstyledButton
                    className={styles.reasoningToggle}
                    onClick={(event) => {
                        event.stopPropagation();
                        setShowReasoning((shown) => !shown);
                    }}
                >
                    <MantineIcon
                        icon={
                            showReasoning ? IconChevronDown : IconChevronRight
                        }
                        size="xs"
                    />
                    Agent&rsquo;s reasoning
                </UnstyledButton>
                <Group gap={6} wrap="nowrap">
                    <Box
                        className={styles.statusDot}
                        bg={statusColors[reviewItem.status]}
                    />
                    <Text fz="xs" c="ldGray.5" tt="capitalize">
                        {reviewItem.status.replaceAll('_', ' ')} ·{' '}
                        {formatLastSeenDate(reviewItem.lastSeenAt)}
                    </Text>
                </Group>
            </Group>
            <Collapse in={showReasoning}>
                <Box className={styles.reasoning}>
                    <Text className={styles.reasoningLabel}>
                        Why this was flagged
                    </Text>
                    <Text fz="xs" c="ldGray.7">
                        {reasoning}
                    </Text>
                    <Group justify="flex-end">
                        {onPreview && (
                            <Button
                                size="compact-xs"
                                variant="subtle"
                                color="gray"
                                leftSection={
                                    <MantineIcon
                                        icon={IconMessages}
                                        size="sm"
                                    />
                                }
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onPreview();
                                }}
                            >
                                Open AI thread
                            </Button>
                        )}
                    </Group>
                </Box>
            </Collapse>
        </Stack>
    );
};

const ReviewItemActionsCell = ({
    reviewItem,
}: {
    reviewItem: AiAgentReviewItemSummary;
}) => {
    const updateStatus = useUpdateAiAgentReviewItemStatus();
    const createWriteback = useCreateAiAgentReviewItemWriteback();

    const propInFlight =
        reviewItem.prWritebackStatus === 'queued' ||
        reviewItem.prWritebackStatus === 'running';
    // Poll the single item while writeback runs so live phase messages surface.
    const { data: polled } = useAiAgentAdminReviewItem(reviewItem.fingerprint, {
        enabled: propInFlight,
        refetchInterval: propInFlight ? 2500 : false,
    });
    const current = polled ?? reviewItem;

    const isWritebackInFlight =
        current.prWritebackStatus === 'queued' ||
        current.prWritebackStatus === 'running';
    const isTerminal =
        current.status === 'resolved' || current.status === 'dismissed';
    const canCreatePr =
        current.writebackEligible &&
        !current.linkedPrUrl &&
        !isTerminal &&
        !isWritebackInFlight;

    if (isWritebackInFlight) {
        const phase = current.prWritebackMessage ?? 'Opening pull request…';
        return (
            <Tooltip label={phase} withArrow openDelay={300}>
                <Group gap={8} wrap="nowrap" maw={180}>
                    <Loader size={12} color="ldGray.5" />
                    <Text fz="xs" c="ldGray.6" lineClamp={1}>
                        {phase}
                    </Text>
                </Group>
            </Tooltip>
        );
    }

    return (
        <Stack gap={6} align="flex-start">
            <Group gap="xs" wrap="nowrap">
                {current.linkedPrUrl && (
                    <LinkButton
                        href={current.linkedPrUrl}
                        target="_blank"
                        onClick={(event) => event.stopPropagation()}
                        leftIcon={IconExternalLink}
                        size="compact-xs"
                        fz="xs"
                        loading={createWriteback.isLoading}
                    >
                        View PR
                    </LinkButton>
                )}

                {canCreatePr && (
                    <Tooltip
                        label="Open a pull request against the dbt project (runs in the background, may take a few minutes)"
                        withArrow
                        multiline
                        maw={260}
                    >
                        <Button
                            size="compact-xs"
                            radius="md"
                            variant="default"
                            loading={createWriteback.isLoading}
                            leftSection={
                                <MantineIcon icon={IconGitPullRequest} />
                            }
                            onClick={(event) => {
                                event.stopPropagation();
                                createWriteback.mutate(current.fingerprint);
                            }}
                        >
                            Create PR
                        </Button>
                    </Tooltip>
                )}

                {!isTerminal && (
                    <Menu position="bottom-end" withinPortal>
                        <Menu.Target>
                            <ActionIcon
                                variant="subtle"
                                color="gray"
                                size="sm"
                                aria-label="More actions"
                                loading={updateStatus.isLoading}
                                onClick={(event) => event.stopPropagation()}
                            >
                                <MantineIcon icon={IconDots} />
                            </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                            <Menu.Item
                                leftSection={<MantineIcon icon={IconX} />}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    updateStatus.mutate({
                                        fingerprint: current.fingerprint,
                                        body: {
                                            status: 'dismissed',
                                            dismissedReason: 'not_actionable',
                                        },
                                    });
                                }}
                            >
                                Dismiss finding
                            </Menu.Item>
                        </Menu.Dropdown>
                    </Menu>
                )}
            </Group>

            {canCreatePr && (
                <Group gap={4} wrap="nowrap">
                    <MantineIcon
                        icon={IconArrowRight}
                        size="xs"
                        className={styles.suggestedStepArrow}
                    />
                    <Text fz="xs" c="ldGray.6" fw={500} lineClamp={1}>
                        {getSuggestedNextStep(current)}
                    </Text>
                </Group>
            )}
        </Stack>
    );
};

const AiAgentAdminReviewItemsTable = ({
    onReviewItemSelect,
    selectedReviewItemUuid,
}: AiAgentAdminReviewItemsTableProps) => {
    const theme = useMantineTheme();
    const [search, setSearch] = useState<string | undefined>(undefined);
    const [reviewSurface, setReviewSurface] =
        useState<ReviewSurface>('findings');
    const [selectedProjectUuids, setSelectedProjectUuids] = useState<string[]>(
        [],
    );
    const [selectedRootCauses, setSelectedRootCauses] = useState<
        AiAgentRootCause[]
    >([]);
    const [selectedSignals, setSelectedSignals] = useState<AiAgentTurnSignal[]>(
        [],
    );
    const deferredSearch = useDeferredValue(search);

    const { data: reviewItems = [], isLoading } = useAiAgentAdminReviewItems({
        statuses: ALL_REVIEW_ITEM_STATUSES,
    });
    const { data: reviewSignals = [], isLoading: isSignalsLoading } =
        useAiAgentAdminReviewSignals({
            enabled: reviewSurface === 'signals',
        });
    const { data: agents } = useAiAgentAdminAgents();
    const { data: projects } = useProjects();

    const agentsMap = useMemo(() => {
        if (!agents) return new Map();
        return new Map(agents.map((agent) => [agent.uuid, agent]));
    }, [agents]);

    const projectsMap = useMemo(() => {
        if (!projects) return new Map();
        return new Map(
            projects.map((project) => [project.projectUuid, project]),
        );
    }, [projects]);

    const matchesReviewItemSearch = useCallback(
        (
            reviewItem: AiAgentReviewItemSummary,
            searchLower: string,
        ): boolean => {
            const agentUuid =
                reviewItem.latestFinding?.agentUuid ?? reviewItem.agentUuid;
            const projectUuid =
                reviewItem.latestFinding?.projectUuid ?? reviewItem.projectUuid;
            const agent = agentUuid ? agentsMap.get(agentUuid) : undefined;
            const project = projectUuid
                ? projectsMap.get(projectUuid)
                : undefined;

            return [
                getIssueTitle(reviewItem),
                getWhatHappened(reviewItem),
                getWhyText(reviewItem),
                getSuggestedNextStep(reviewItem),
                getActionLabel(reviewItem),
                rootCauseLabels[reviewItem.primaryRootCause],
                agent?.name,
                project?.name,
                reviewItem.latestFinding?.recommendation?.title,
                reviewItem.latestFinding?.projectContextEntry?.content,
            ]
                .filter(Boolean)
                .some((value) => value?.toLowerCase().includes(searchLower));
        },
        [agentsMap, projectsMap],
    );

    const matchesSignalSearch = useCallback(
        (signal: AiAgentReviewSignalSummary, searchLower: string): boolean => {
            const agent = agentsMap.get(signal.agentUuid);
            const project = projectsMap.get(signal.projectUuid);
            return [
                signal.prompt,
                signal.responsePreview,
                signal.errorMessage,
                signalLabels[signal.signal],
                getSignalResultLabel(signal),
                getSignalWhyText(signal),
                getSignalActionText(signal),
                agent?.name,
                project?.name,
            ]
                .filter(Boolean)
                .some((value) => value?.toLowerCase().includes(searchLower));
        },
        [agentsMap, projectsMap],
    );

    const getReviewItemProjectUuid = (
        reviewItem: AiAgentReviewItemSummary,
    ): string | null =>
        reviewItem.latestFinding?.projectUuid ?? reviewItem.projectUuid ?? null;

    const searchFilteredReviewItems = useMemo(() => {
        if (!deferredSearch) return reviewItems;
        const searchLower = deferredSearch.toLowerCase();
        return reviewItems.filter((item) =>
            matchesReviewItemSearch(item, searchLower),
        );
    }, [deferredSearch, matchesReviewItemSearch, reviewItems]);

    const searchFilteredReviewSignals = useMemo(() => {
        if (!deferredSearch) return reviewSignals;
        const searchLower = deferredSearch.toLowerCase();
        return reviewSignals.filter((signal) =>
            matchesSignalSearch(signal, searchLower),
        );
    }, [deferredSearch, matchesSignalSearch, reviewSignals]);

    const projectFilteredReviewItems = useMemo(() => {
        if (selectedProjectUuids.length === 0) {
            return searchFilteredReviewItems;
        }
        const projectSet = new Set(selectedProjectUuids);
        return searchFilteredReviewItems.filter((item) => {
            const projectUuid = getReviewItemProjectUuid(item);
            return projectUuid !== null && projectSet.has(projectUuid);
        });
    }, [searchFilteredReviewItems, selectedProjectUuids]);

    const projectFilteredReviewSignals = useMemo(() => {
        if (selectedProjectUuids.length === 0) {
            return searchFilteredReviewSignals;
        }
        const projectSet = new Set(selectedProjectUuids);
        return searchFilteredReviewSignals.filter((signal) =>
            projectSet.has(signal.projectUuid),
        );
    }, [searchFilteredReviewSignals, selectedProjectUuids]);

    const filteredReviewItems = useMemo(() => {
        if (selectedRootCauses.length === 0) {
            return projectFilteredReviewItems;
        }
        const rootCauseSet = new Set(selectedRootCauses);
        return projectFilteredReviewItems.filter((item) =>
            rootCauseSet.has(item.primaryRootCause),
        );
    }, [projectFilteredReviewItems, selectedRootCauses]);

    const filteredReviewSignals = useMemo(() => {
        if (selectedSignals.length === 0) {
            return projectFilteredReviewSignals;
        }
        const signalSet = new Set(selectedSignals);
        return projectFilteredReviewSignals.filter((signal) =>
            signalSet.has(signal.signal),
        );
    }, [projectFilteredReviewSignals, selectedSignals]);

    const projectFacetOptions = useMemo((): FilterFacetOption[] => {
        const counts = new Map<string, number>();
        const source =
            reviewSurface === 'findings'
                ? searchFilteredReviewItems
                      .filter((item) => {
                          if (selectedRootCauses.length === 0) return true;
                          return selectedRootCauses.includes(
                              item.primaryRootCause,
                          );
                      })
                      .map(getReviewItemProjectUuid)
                : searchFilteredReviewSignals
                      .filter((signal) => {
                          if (selectedSignals.length === 0) return true;
                          return selectedSignals.includes(signal.signal);
                      })
                      .map((signal) => signal.projectUuid);

        for (const projectUuid of source) {
            if (!projectUuid) continue;
            counts.set(projectUuid, (counts.get(projectUuid) ?? 0) + 1);
        }

        return Array.from(counts.entries())
            .map(([projectUuid, count]) => ({
                value: projectUuid,
                label: projectsMap.get(projectUuid)?.name ?? 'Unknown project',
                count,
            }))
            .sort(
                (a, b) => b.count - a.count || a.label.localeCompare(b.label),
            );
    }, [
        projectsMap,
        reviewSurface,
        searchFilteredReviewItems,
        searchFilteredReviewSignals,
        selectedRootCauses,
        selectedSignals,
    ]);

    const rootCauseFacetOptions = useMemo((): FilterFacetOption[] => {
        const counts = new Map<AiAgentRootCause, number>();
        for (const item of projectFilteredReviewItems) {
            counts.set(
                item.primaryRootCause,
                (counts.get(item.primaryRootCause) ?? 0) + 1,
            );
        }
        return (Object.keys(rootCauseLabels) as AiAgentRootCause[])
            .map((rootCause) => ({
                value: rootCause,
                label: rootCauseLabels[rootCause],
                count: counts.get(rootCause) ?? 0,
            }))
            .sort(
                (a, b) => b.count - a.count || a.label.localeCompare(b.label),
            );
    }, [projectFilteredReviewItems]);

    const signalFacetOptions = useMemo((): FilterFacetOption[] => {
        const counts = new Map<AiAgentTurnSignal, number>();
        for (const signal of projectFilteredReviewSignals) {
            counts.set(signal.signal, (counts.get(signal.signal) ?? 0) + 1);
        }
        return (Object.keys(signalLabels) as AiAgentTurnSignal[])
            .map((turnSignal) => ({
                value: turnSignal,
                label: signalLabels[turnSignal],
                count: counts.get(turnSignal) ?? 0,
            }))
            .sort(
                (a, b) => b.count - a.count || a.label.localeCompare(b.label),
            );
    }, [projectFilteredReviewSignals]);

    const hasActiveFilters =
        selectedProjectUuids.length > 0 ||
        selectedRootCauses.length > 0 ||
        selectedSignals.length > 0;

    const clearAllFilters = useCallback(() => {
        setSelectedProjectUuids([]);
        setSelectedRootCauses([]);
        setSelectedSignals([]);
    }, []);

    const renderReviewsToolbar = ({
        visibleCount,
        totalCount,
        noun,
        isLoading: toolbarLoading,
        surface,
    }: {
        visibleCount: number;
        totalCount: number;
        noun: 'item' | 'signal';
        isLoading: boolean;
        surface: ReviewSurface;
    }) => {
        const pluralised = visibleCount === 1 ? noun : `${noun}s`;
        const countLabel = toolbarLoading
            ? 'Loading…'
            : hasActiveFilters && visibleCount !== totalCount
              ? `${visibleCount} of ${totalCount} ${pluralised}`
              : `${visibleCount} ${pluralised}`;

        return (
            <Box>
                <Group py="lg" px="xl" justify="space-between">
                    <Group gap="xs" wrap="wrap">
                        <SearchFilter
                            search={search}
                            setSearch={setSearch}
                            placeholder="Search reviews"
                        />

                        <Divider orientation="vertical" w={1} h={20} />
                        <SegmentedControl
                            size="xs"
                            radius="md"
                            value={reviewSurface}
                            onChange={(value) =>
                                setReviewSurface(value as ReviewSurface)
                            }
                            data={[
                                { value: 'findings', label: 'Findings' },
                                { value: 'signals', label: 'Signals' },
                            ]}
                        />
                        <ReviewConceptHelp />

                        <FilterFacet
                            label="Project"
                            icon={IconBox}
                            options={projectFacetOptions}
                            selected={selectedProjectUuids}
                            onChange={setSelectedProjectUuids}
                            emptyLabel="No projects in current view"
                            tooltipLabel="Filter by project"
                        />
                        {surface === 'findings' ? (
                            <FilterFacet
                                label="Root cause"
                                icon={IconTag}
                                options={rootCauseFacetOptions}
                                selected={selectedRootCauses}
                                onChange={(values) =>
                                    setSelectedRootCauses(
                                        values as AiAgentRootCause[],
                                    )
                                }
                                emptyLabel="No root causes in current view"
                                tooltipLabel="Filter by root cause"
                            />
                        ) : (
                            <FilterFacet
                                label="Signal"
                                icon={IconTag}
                                options={signalFacetOptions}
                                selected={selectedSignals}
                                onChange={(values) =>
                                    setSelectedSignals(
                                        values as AiAgentTurnSignal[],
                                    )
                                }
                                emptyLabel="No signals in current view"
                                tooltipLabel="Filter by signal type"
                            />
                        )}
                        {hasActiveFilters && (
                            <Button
                                variant="subtle"
                                color="gray"
                                size="xs"
                                radius="md"
                                leftSection={
                                    <MantineIcon icon={IconFilterX} size="xs" />
                                }
                                onClick={clearAllFilters}
                            >
                                Clear filters
                            </Button>
                        )}
                    </Group>

                    <Box className={styles.countPill}>
                        <Text fz="sm" fw={500}>
                            {countLabel}
                        </Text>
                    </Box>
                </Group>
                <Divider color="ldGray.2" />
            </Box>
        );
    };

    const columns: MRT_ColumnDef<AiAgentReviewItemSummary>[] = useMemo(
        () => [
            {
                accessorKey: 'primaryRootCause',
                header: 'Type',
                enableSorting: false,
                size: 220,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconTag} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const reviewItem = row.original;
                    const subcategory =
                        reviewItem.latestFinding?.subcategories[0];
                    const contextEntry =
                        reviewItem.latestFinding?.projectContextEntry ?? null;
                    return (
                        <Stack gap={7} align="flex-start">
                            <CategoryBadge
                                variant="dot"
                                label={
                                    rootCauseLabels[reviewItem.primaryRootCause]
                                }
                                color={
                                    rootCauseColors[reviewItem.primaryRootCause]
                                }
                            />
                            {contextEntry ? (
                                <CategoryBadge
                                    variant="dot"
                                    label={contextEntry.kind}
                                    color="gray"
                                />
                            ) : (
                                subcategory && (
                                    <CategoryBadge
                                        variant="dot"
                                        label={subcategory.replaceAll('_', ' ')}
                                        color="gray"
                                    />
                                )
                            )}
                        </Stack>
                    );
                },
            },
            {
                accessorKey: 'title',
                header: 'Finding',
                enableSorting: false,
                size: 650,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconListCheck} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const reviewItem = row.original;
                    const latestFinding = reviewItem.latestFinding;
                    return (
                        <FindingCell
                            reviewItem={reviewItem}
                            onPreview={
                                latestFinding
                                    ? () =>
                                          onReviewItemSelect?.({
                                              projectUuid:
                                                  latestFinding.projectUuid,
                                              agentUuid:
                                                  latestFinding.agentUuid,
                                              threadUuid:
                                                  latestFinding.threadUuid,
                                              reviewItemUuid: reviewItem.uuid,
                                          })
                                    : null
                            }
                        />
                    );
                },
            },
            {
                accessorKey: 'agentUuid',
                header: 'Agent',
                enableSorting: false,
                size: 150,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconRobotFace} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const reviewItem = row.original;
                    const agentUuid =
                        reviewItem.latestFinding?.agentUuid ??
                        reviewItem.agentUuid;
                    const projectUuid =
                        reviewItem.latestFinding?.projectUuid ??
                        reviewItem.projectUuid;
                    const agent = agentUuid
                        ? agentsMap.get(agentUuid)
                        : undefined;
                    const project = projectUuid
                        ? projectsMap.get(projectUuid)
                        : undefined;
                    const projectName = project?.name ?? 'Organization';

                    if (agent) {
                        return (
                            <AgentNamePill
                                name={agent.name}
                                imageUrl={agent.imageUrl}
                            />
                        );
                    }

                    return (
                        <Group gap="two" wrap="nowrap">
                            <MantineIcon
                                icon={IconBox}
                                color="ldGray.6"
                                size="sm"
                            />
                            <Text fz="sm" c="ldGray.9" lineClamp={1}>
                                {projectName}
                            </Text>
                        </Group>
                    );
                },
            },
            {
                accessorKey: 'status',
                header: 'Action',
                enableSorting: false,
                size: 260,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon
                            icon={IconGitPullRequest}
                            color="ldGray.6"
                        />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => (
                    <ReviewItemActionsCell reviewItem={row.original} />
                ),
            },
        ],
        [agentsMap, onReviewItemSelect, projectsMap],
    );

    const signalColumns: MRT_ColumnDef<AiAgentReviewSignalSummary>[] = useMemo(
        () => [
            {
                accessorKey: 'promotedToFinding',
                header: 'Result',
                enableSorting: false,
                size: 110,
                Header: ({ column }) => (
                    <Group gap="two" wrap="nowrap">
                        <MantineIcon icon={IconTag} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const signal = row.original;
                    const ConfidenceIcon = getConfidenceIcon(signal.confidence);
                    return (
                        <Group gap={4} wrap="nowrap">
                            <CategoryBadge
                                variant="dot"
                                label={getSignalResultLabel(signal)}
                                color={
                                    signal.finding
                                        ? rootCauseColors[
                                              signal.finding.primaryRootCause
                                          ]
                                        : 'gray'
                                }
                            />
                            <Tooltip
                                label={`${signal.confidence} confidence`}
                                withArrow
                            >
                                <Box className={styles.confidenceIcon}>
                                    <MantineIcon
                                        icon={ConfidenceIcon}
                                        color="ldGray.6"
                                        size="xs"
                                    />
                                </Box>
                            </Tooltip>
                        </Group>
                    );
                },
            },
            {
                accessorKey: 'signal',
                header: 'Signal',
                enableSorting: false,
                size: 300,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconInfoCircle} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const signal = row.original;
                    const subcategory = signal.finding?.subcategories[0];

                    return (
                        <Stack gap={4}>
                            <Group gap={4} wrap="nowrap">
                                <CategoryBadge
                                    variant="dot"
                                    label={signalLabels[signal.signal]}
                                    color="gray"
                                />
                                {subcategory && (
                                    <CategoryBadge
                                        variant="dot"
                                        label={subcategory.replaceAll('_', ' ')}
                                        color="gray"
                                    />
                                )}
                                <SuggestedStep>
                                    {getSignalActionText(signal)}
                                </SuggestedStep>
                            </Group>
                            <ExpandableText lineClamp={1}>
                                {getSignalWhyText(signal)}
                            </ExpandableText>
                        </Stack>
                    );
                },
            },
            {
                accessorKey: 'prompt',
                header: 'Turn',
                enableSorting: false,
                size: 300,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconListCheck} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const signal = row.original;
                    return (
                        <Stack gap={2}>
                            <Text fw={600} fz="sm" c="ldGray.9" lineClamp={1}>
                                {signal.prompt}
                            </Text>
                            <ExpandableText lineClamp={1}>
                                {signal.errorMessage ??
                                    signal.responsePreview ??
                                    'No response captured'}
                            </ExpandableText>
                        </Stack>
                    );
                },
            },
            {
                accessorKey: 'agentUuid',
                header: 'Agent',
                enableSorting: false,
                size: 100,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconRobotFace} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const signal = row.original;
                    const agent = agentsMap.get(signal.agentUuid);
                    const project = projectsMap.get(signal.projectUuid);

                    if (agent) {
                        return (
                            <AgentNamePill
                                name={agent.name}
                                imageUrl={agent.imageUrl}
                            />
                        );
                    }

                    return (
                        <Group gap="two" wrap="nowrap">
                            <MantineIcon
                                icon={IconBox}
                                color="ldGray.6"
                                size="sm"
                            />
                            <Text fz="sm" c="ldGray.9" lineClamp={1}>
                                {project?.name ?? 'Unknown agent'}
                            </Text>
                        </Group>
                    );
                },
            },
            {
                accessorKey: 'createdAt',
                header: 'Reviewed',
                enableSorting: true,
                size: 150,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconClock} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const signal = row.original;
                    return (
                        <Group gap="xs" wrap="nowrap" justify="space-between">
                            <Text fz="xs" c="ldGray.7" fw={500}>
                                {formatLastSeenDate(signal.createdAt)}
                            </Text>
                            <Tooltip label="Open AI thread preview" withArrow>
                                <ActionIcon
                                    variant="subtle"
                                    color="gray"
                                    size="sm"
                                    aria-label="Open AI thread preview"
                                    className={styles.threadIcon}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        onReviewItemSelect?.({
                                            projectUuid: signal.projectUuid,
                                            agentUuid: signal.agentUuid,
                                            threadUuid: signal.threadUuid,
                                            reviewItemUuid:
                                                signal.finding?.reviewItemUuid,
                                        });
                                    }}
                                >
                                    <MantineIcon icon={IconMessages} />
                                </ActionIcon>
                            </Tooltip>
                        </Group>
                    );
                },
            },
        ],
        [agentsMap, onReviewItemSelect, projectsMap],
    );

    const table = useContentTable({
        columns,
        data: filteredReviewItems,
        enableColumnResizing: false,
        enableRowNumbers: false,
        enablePagination: false,
        enableFilters: false,
        enableFullScreenToggle: false,
        enableDensityToggle: false,
        enableColumnActions: false,
        enableColumnFilters: false,
        enableHiding: false,
        enableGlobalFilterModes: false,
        enableSorting: true,
        enableTopToolbar: true,
        enableBottomToolbar: false,
        mantinePaperProps: {
            shadow: undefined,
            style: {
                border: `1px solid ${theme.colors.ldGray[2]}`,
                borderRadius: theme.spacing.sm,
                boxShadow: theme.shadows.subtle,
                display: 'flex',
                flexDirection: 'column',
            },
        },
        mantineTableContainerProps: {
            style: {
                maxHeight: 'calc(100dvh - 350px)',
            },
        },
        mantineTableHeadRowProps: {
            style: {
                boxShadow: 'none',
            },
        },
        mantineTableBodyCellProps: {
            style: {
                padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                borderRight: 'none',
                borderLeft: 'none',
                borderBottom: `1px solid ${theme.colors.ldGray[2]}`,
                borderTop: 'none',
            },
        },
        mantineTableBodyRowProps: ({ row, table: mantineTable }) => {
            if (mantineTable.getState().showSkeletons) {
                return {};
            }

            const reviewItem = row.original;
            const isSelected = selectedReviewItemUuid === reviewItem.uuid;

            return {
                className: styles.bodyRow,
                style: {
                    backgroundColor: isSelected
                        ? theme.colors.ldGray[1]
                        : undefined,
                },
            };
        },
        renderTopToolbar: () =>
            renderReviewsToolbar({
                visibleCount: filteredReviewItems.length,
                totalCount: searchFilteredReviewItems.length,
                noun: 'item',
                isLoading,
                surface: 'findings',
            }),
        state: {
            showProgressBars: false,
            showSkeletons: isLoading,
            density: 'md',
        },
        mantineLoadingOverlayProps: {
            loaderProps: {
                color: 'gray',
            },
        },
    });

    const signalTable = useContentTable({
        columns: signalColumns,
        data: filteredReviewSignals,
        enableColumnResizing: false,
        enableRowNumbers: false,
        enablePagination: false,
        enableFilters: false,
        enableFullScreenToggle: false,
        enableDensityToggle: false,
        enableColumnActions: false,
        enableColumnFilters: false,
        enableHiding: false,
        enableGlobalFilterModes: false,
        enableSorting: true,
        enableTopToolbar: true,
        enableBottomToolbar: false,
        mantinePaperProps: {
            shadow: undefined,
            style: {
                border: `1px solid ${theme.colors.ldGray[2]}`,
                borderRadius: theme.spacing.sm,
                boxShadow: theme.shadows.subtle,
                display: 'flex',
                flexDirection: 'column',
            },
        },
        mantineTableContainerProps: {
            style: {
                maxHeight: 'calc(100dvh - 350px)',
            },
        },
        mantineTableHeadRowProps: {
            style: {
                boxShadow: 'none',
            },
        },
        mantineTableBodyCellProps: {
            style: {
                padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                borderRight: 'none',
                borderLeft: 'none',
                borderBottom: `1px solid ${theme.colors.ldGray[2]}`,
                borderTop: 'none',
            },
        },
        mantineTableBodyRowProps: ({ row, table: mantineTable }) => {
            if (mantineTable.getState().showSkeletons) {
                return {};
            }

            const signal = row.original;
            return {
                className: styles.bodyRow,
                style: {
                    backgroundColor:
                        selectedReviewItemUuid &&
                        selectedReviewItemUuid ===
                            signal.finding?.reviewItemUuid
                            ? theme.colors.ldGray[1]
                            : undefined,
                },
            };
        },
        renderTopToolbar: () =>
            renderReviewsToolbar({
                visibleCount: filteredReviewSignals.length,
                totalCount: searchFilteredReviewSignals.length,
                noun: 'signal',
                isLoading: isSignalsLoading,
                surface: 'signals',
            }),
        state: {
            showProgressBars: false,
            showSkeletons: isSignalsLoading,
            density: 'md',
        },
        mantineLoadingOverlayProps: {
            loaderProps: {
                color: 'gray',
            },
        },
    });

    return (
        <Box>
            {reviewSurface === 'findings' ? (
                <ContentTable table={table} />
            ) : (
                <ContentTable table={signalTable} />
            )}
        </Box>
    );
};

export default AiAgentAdminReviewItemsTable;
