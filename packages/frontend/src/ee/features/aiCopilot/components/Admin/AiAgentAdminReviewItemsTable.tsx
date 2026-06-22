import {
    type AiAgentReviewItemStatus,
    type AiAgentReviewItemSummary,
    type AiAgentReviewSignalSummary,
    type AiAgentRootCause,
    type AiAgentTurnSignal,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Divider,
    Group,
    HoverCard,
    Stack,
    Text,
    Tooltip,
    useMantineTheme,
} from '@mantine-8/core';
import {
    IconArrowRight,
    IconBox,
    IconCircleCheck,
    IconCircleDashed,
    IconClock,
    IconFilterX,
    IconHelpCircle,
    IconInfoCircle,
    IconListCheck,
    IconMessages,
    IconRobotFace,
    IconTag,
    IconTriangle,
    IconUser,
    IconX,
} from '@tabler/icons-react';
import { type RowSelectionState } from '@tanstack/react-table';
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
    type ContentTableColumnDef,
} from '../../../../../components/common/ContentTable';
import FilterFacet, {
    type FilterFacetOption,
} from '../../../../../components/common/FilterFacet';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useOnboardingMock } from '../../../../../hooks/useOnboardingMock';
import { useOrgUsersByUuid } from '../../../../../hooks/useOrganizationUsers';
import { useProjects } from '../../../../../hooks/useProjects';
import useApp from '../../../../../providers/App/useApp';
import {
    useAiAgentAdminAgents,
    useAiAgentAdminReviewItems,
    useAiAgentAdminReviewSignals,
    useUpdateAiAgentReviewItemStatus,
} from '../../hooks/useAiAgentAdmin';
import { AgentNamePill } from '../AgentNamePill';
import styles from './AiAgentAdminReviewItemsTable.module.css';
import { EXAMPLE_REVIEW_ITEMS, isExampleReviewItem } from './onboarding';
import {
    buildAssigneeFacetOptions,
    matchesAssigneeFilter,
} from './reviewAssigneeFacet';
import { ReviewItemActions } from './ReviewItemActions';
import {
    DEFAULT_VISIBLE_ROOT_CAUSES,
    formatReviewDate,
    getActionLabel,
    getIssueTitle,
    getRecommendationActionLabel,
    getSuggestedNextStep,
    getWhatHappened,
    getWhyText,
    reviewRootCauseColors,
    reviewRootCauseLabels,
} from './reviewItemDetails';
import { SearchFilter } from './SearchFilter';

const ACTIVE_REVIEW_ITEM_STATUSES: AiAgentReviewItemStatus[] = [
    'triage',
    'open',
    'in_progress',
];

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
    /**
     * While true and the queue is empty, sample rows are shown so the onboarding
     * tour has findings to highlight. Flips to real data once the tour is done.
     */
    showOnboardingExamples?: boolean;
};

const getSignalResultLabel = (signal: AiAgentReviewSignalSummary): string => {
    if (signal.finding) {
        return reviewRootCauseLabels[signal.finding.primaryRootCause];
    }

    return signal.promotedToFinding ? 'Finding pending' : 'Signal only';
};

const getSignalWhyText = (signal: AiAgentReviewSignalSummary): string =>
    signal.promotionReason ??
    signal.finding?.recommendation?.rationale ??
    'The judge reviewed this turn but did not promote it into a review item.';

const getSignalActionText = (signal: AiAgentReviewSignalSummary): string => {
    if (signal.finding?.recommendation) {
        return getRecommendationActionLabel(
            signal.finding.recommendation.actionType,
        );
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

// Plain-English gloss for each root cause + which two are fixable from this page.
const rootCauseHelp: Record<
    AiAgentRootCause,
    { desc: string; opensPr: boolean }
> = {
    semantic_layer: {
        desc: 'A metric, field, or model was missing or off',
        opensPr: true,
    },
    project_context: {
        desc: 'The agent didn’t know something about your data',
        opensPr: true,
    },
    agent_configuration: {
        desc: 'Its instructions or setup got in the way',
        opensPr: false,
    },
    product_capability: {
        desc: 'The agent can’t do this yet',
        opensPr: false,
    },
    runtime_reliability: {
        desc: 'Something broke or timed out',
        opensPr: false,
    },
    feedback_quality: {
        desc: 'The judge’s read needs a second look',
        opensPr: false,
    },
    not_a_failure: { desc: 'Nothing wrong, it answered fine', opensPr: false },
    ambiguous: { desc: 'Not clear, worth a look', opensPr: false },
};

const rootCauseHelpOrder: AiAgentRootCause[] = [
    'semantic_layer',
    'project_context',
    'agent_configuration',
    'product_capability',
    'runtime_reliability',
    'feedback_quality',
    'not_a_failure',
    'ambiguous',
];

const ReviewConceptHelp = () => (
    <HoverCard
        width={380}
        shadow="md"
        position="bottom-start"
        withArrow
        openDelay={150}
    >
        <HoverCard.Target>
            <Box className={styles.headerHelpIcon}>
                <MantineIcon icon={IconHelpCircle} color="ldGray.5" size="sm" />
            </Box>
        </HoverCard.Target>
        <HoverCard.Dropdown>
            <Stack gap="sm">
                <Stack gap={4}>
                    <Text fz="xs" c="dimmed">
                        A{' '}
                        <Text span fw={600} c="ldGray.9" fz="inherit">
                            turn
                        </Text>{' '}
                        is one question and answer. When a turn shows a clear
                        issue, it becomes a{' '}
                        <Text span fw={600} c="ldGray.9" fz="inherit">
                            finding
                        </Text>{' '}
                        so you can review it here and decide what to fix next.
                    </Text>
                </Stack>
                <Divider />
                <Stack gap={6}>
                    <Text fz="xs" fw={600} c="ldGray.9">
                        What went wrong
                    </Text>
                    {rootCauseHelpOrder.map((cause) => (
                        <Group
                            key={cause}
                            gap="xs"
                            wrap="nowrap"
                            align="flex-start"
                        >
                            <Box miw={110}>
                                <CategoryBadge
                                    variant="dot"
                                    label={reviewRootCauseLabels[cause]}
                                    color={reviewRootCauseColors[cause]}
                                />
                            </Box>
                            <Text fz="xs" c="dimmed">
                                {rootCauseHelp[cause].desc}
                                {rootCauseHelp[cause].opensPr && (
                                    <Text
                                        span
                                        fz="inherit"
                                        c="ldGray.7"
                                        fw={600}
                                    >
                                        {' '}
                                        · fixable here
                                    </Text>
                                )}
                            </Text>
                        </Group>
                    ))}
                </Stack>
            </Stack>
        </HoverCard.Dropdown>
    </HoverCard>
);

const isTerminalReviewItem = (reviewItem: AiAgentReviewItemSummary): boolean =>
    reviewItem.status === 'resolved' ||
    reviewItem.status === 'dismissed' ||
    reviewItem.status === 'duplicate';

const FindingCell = ({
    reviewItem,
}: {
    reviewItem: AiAgentReviewItemSummary;
}) => (
    <Text fw={700} fz="sm" c="ldGray.9" lineClamp={2}>
        {getIssueTitle(reviewItem)}
    </Text>
);

const AiAgentAdminReviewItemsTable = ({
    onReviewItemSelect,
    selectedReviewItemUuid,
    showOnboardingExamples = false,
}: AiAgentAdminReviewItemsTableProps) => {
    const theme = useMantineTheme();
    const [search, setSearch] = useState<string | undefined>(undefined);
    const [reviewSurface, _setReviewSurface] =
        useState<ReviewSurface>('findings');
    const [selectedProjectUuids, setSelectedProjectUuids] = useState<string[]>(
        [],
    );
    const [selectedRootCauses, setSelectedRootCauses] = useState<
        AiAgentRootCause[]
    >(DEFAULT_VISIBLE_ROOT_CAUSES);
    const [selectedSignals, setSelectedSignals] = useState<AiAgentTurnSignal[]>(
        [],
    );
    const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
    const deferredSearch = useDeferredValue(search);
    const updateStatus = useUpdateAiAgentReviewItemStatus();

    const { user } = useApp();
    const currentUserUuid = user.data?.userUuid ?? null;
    const orgUsersByUuid = useOrgUsersByUuid();

    // While the tour is running the table always shows the sample rows so the
    // tour is deterministic; otherwise it passes real data straight through
    // (which may be empty or not).
    const selectReviewItems = useOnboardingMock(
        EXAMPLE_REVIEW_ITEMS,
        showOnboardingExamples,
    );
    const { data: reviewItems = [], isLoading } = useAiAgentAdminReviewItems(
        { statuses: ACTIVE_REVIEW_ITEM_STATUSES },
        { select: selectReviewItems },
    );
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
                reviewRootCauseLabels[reviewItem.primaryRootCause],
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
        let items = projectFilteredReviewItems;
        if (selectedRootCauses.length > 0) {
            const rootCauseSet = new Set(selectedRootCauses);
            items = items.filter((item) =>
                rootCauseSet.has(item.primaryRootCause),
            );
        }
        if (selectedAssignees.length > 0) {
            items = items.filter((item) =>
                matchesAssigneeFilter(item, selectedAssignees),
            );
        }
        return items;
    }, [projectFilteredReviewItems, selectedRootCauses, selectedAssignees]);

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
        return (Object.keys(reviewRootCauseLabels) as AiAgentRootCause[])
            .map((rootCause) => ({
                value: rootCause,
                label: reviewRootCauseLabels[rootCause],
                count: counts.get(rootCause) ?? 0,
            }))
            .sort(
                (a, b) => b.count - a.count || a.label.localeCompare(b.label),
            );
    }, [projectFilteredReviewItems]);

    const assigneeFacetOptions = useMemo(
        (): FilterFacetOption[] =>
            buildAssigneeFacetOptions({
                items: projectFilteredReviewItems,
                usersByUuid: orgUsersByUuid,
                currentUserUuid,
            }),
        [projectFilteredReviewItems, orgUsersByUuid, currentUserUuid],
    );

    const _signalFacetOptions = useMemo((): FilterFacetOption[] => {
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

    const hasDefaultRootCauseSelection =
        selectedRootCauses.length === DEFAULT_VISIBLE_ROOT_CAUSES.length &&
        DEFAULT_VISIBLE_ROOT_CAUSES.every((rootCause) =>
            selectedRootCauses.includes(rootCause),
        );

    const hasActiveFilters =
        selectedProjectUuids.length > 0 ||
        !hasDefaultRootCauseSelection ||
        selectedSignals.length > 0 ||
        selectedAssignees.length > 0;

    const clearAllFilters = useCallback(() => {
        setSelectedProjectUuids([]);
        setSelectedRootCauses(DEFAULT_VISIBLE_ROOT_CAUSES);
        setSelectedSignals([]);
        setSelectedAssignees([]);
    }, []);

    const handleRowSelectionChange = useCallback(
        (
            updater:
                | RowSelectionState
                | ((previous: RowSelectionState) => RowSelectionState),
        ) => {
            setRowSelection((previous) =>
                typeof updater === 'function' ? updater(previous) : updater,
            );
        },
        [],
    );

    const renderReviewsToolbar = ({
        visibleCount,
        totalCount,
        noun,
        isLoading: toolbarLoading,
        surface,
        selectedCount = 0,
        isDismissingSelected = false,
        onClearSelection,
        onDismissSelected,
    }: {
        visibleCount: number;
        totalCount: number;
        noun: 'finding' | 'turn';
        isLoading: boolean;
        surface: ReviewSurface;
        selectedCount?: number;
        isDismissingSelected?: boolean;
        onClearSelection?: () => void;
        onDismissSelected?: () => void;
    }) => {
        const pluralised = visibleCount === 1 ? noun : `${noun}s`;
        const hasSelection = selectedCount > 0;
        const countLabel = toolbarLoading
            ? 'Loading…'
            : hasActiveFilters && visibleCount !== totalCount
              ? `${visibleCount} of ${totalCount} ${pluralised}`
              : `${visibleCount} ${pluralised}`;
        const helperCopy =
            'Findings are issues worth attention. Click a row to inspect details and thread context.';

        return (
            <Box>
                <Group py="lg" px="xl" justify="space-between">
                    <Group gap="sm" wrap="wrap" className={styles.toolbarGroup}>
                        <SearchFilter
                            search={search}
                            setSearch={setSearch}
                            placeholder="Search findings"
                        />

                        <Group
                            gap={6}
                            wrap="nowrap"
                            className={styles.toolbarHeading}
                        >
                            <Text fz="sm" fw={700} c="ldGray.9">
                                Findings
                            </Text>
                            <ReviewConceptHelp />
                        </Group>

                        <FilterFacet
                            label="Project"
                            icon={IconBox}
                            options={projectFacetOptions}
                            selected={selectedProjectUuids}
                            onChange={setSelectedProjectUuids}
                            emptyLabel="No projects in current view"
                            tooltipLabel="Filter by project"
                        />
                        <FilterFacet
                            label="Cause"
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
                        <FilterFacet
                            label="Assignee"
                            icon={IconUser}
                            options={assigneeFacetOptions}
                            selected={selectedAssignees}
                            onChange={setSelectedAssignees}
                            emptyLabel="No assignees in current view"
                            tooltipLabel="Filter by assignee"
                        />
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

                    <Group gap="sm" wrap="nowrap">
                        {surface === 'findings' &&
                            hasSelection &&
                            onDismissSelected && (
                                <>
                                    <Text fz="sm" c="dimmed" fw={500}>
                                        {selectedCount} selected
                                    </Text>
                                    <Button
                                        size="xs"
                                        variant="light"
                                        color="red"
                                        loading={isDismissingSelected}
                                        leftSection={
                                            <MantineIcon icon={IconX} />
                                        }
                                        onClick={onDismissSelected}
                                    >
                                        Dismiss findings
                                    </Button>
                                    {onClearSelection && (
                                        <Button
                                            size="xs"
                                            variant="subtle"
                                            color="gray"
                                            onClick={onClearSelection}
                                        >
                                            Clear
                                        </Button>
                                    )}
                                </>
                            )}
                        {!hasSelection && (
                            <Box className={styles.countPill}>
                                <Text fz="sm" fw={500}>
                                    {countLabel}
                                </Text>
                            </Box>
                        )}
                    </Group>
                </Group>
                <Text px="xl" pb="sm" fz="xs" c="dimmed">
                    {helperCopy}
                </Text>
                <Divider color="ldGray.2" />
            </Box>
        );
    };

    const columns: ContentTableColumnDef<AiAgentReviewItemSummary>[] = useMemo(
        () => [
            {
                accessorKey: 'primaryRootCause',
                header: 'Cause',
                enableSorting: false,
                size: 170,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconTag} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const reviewItem = row.original;
                    const isExample = isExampleReviewItem(reviewItem.uuid);
                    return (
                        <Stack gap={7} align="flex-start">
                            {isExample && (
                                <CategoryBadge
                                    variant="token"
                                    color="gray"
                                    label="Example"
                                />
                            )}
                            <CategoryBadge
                                variant="dot"
                                label={
                                    reviewRootCauseLabels[
                                        reviewItem.primaryRootCause
                                    ]
                                }
                                color={
                                    reviewRootCauseColors[
                                        reviewItem.primaryRootCause
                                    ]
                                }
                            />
                        </Stack>
                    );
                },
            },
            {
                accessorKey: 'title',
                header: 'Finding',
                enableSorting: false,
                size: 700,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconListCheck} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const reviewItem = row.original;
                    return <FindingCell reviewItem={reviewItem} />;
                },
            },
            {
                accessorKey: 'prWritebackStatus',
                header: 'Action',
                enableSorting: false,
                size: 190,
                Header: ({ column }) => (
                    <Group gap={4}>
                        <MantineIcon icon={IconArrowRight} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) =>
                    isExampleReviewItem(row.original.uuid) ? (
                        <Box data-tour="reviews-create-pr">
                            <Button
                                size="compact-xs"
                                radius="md"
                                variant="default"
                                disabled
                            >
                                Create PR
                            </Button>
                        </Box>
                    ) : (
                        <ReviewItemActions reviewItem={row.original} />
                    ),
            },
        ],
        [],
    );

    const signalColumns: ContentTableColumnDef<AiAgentReviewSignalSummary>[] =
        useMemo(
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
                        const ConfidenceIcon = getConfidenceIcon(
                            signal.confidence,
                        );
                        return (
                            <Group gap={4} wrap="nowrap">
                                <CategoryBadge
                                    variant="dot"
                                    label={getSignalResultLabel(signal)}
                                    color={
                                        signal.finding
                                            ? reviewRootCauseColors[
                                                  signal.finding
                                                      .primaryRootCause
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
                            <MantineIcon
                                icon={IconInfoCircle}
                                color="ldGray.6"
                            />
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
                                            label={subcategory.replaceAll(
                                                '_',
                                                ' ',
                                            )}
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
                            <MantineIcon
                                icon={IconListCheck}
                                color="ldGray.6"
                            />
                            {column.columnDef.header}
                        </Group>
                    ),
                    Cell: ({ row }) => {
                        const signal = row.original;
                        return (
                            <Stack gap={2}>
                                <Text
                                    fw={600}
                                    fz="sm"
                                    c="ldGray.9"
                                    lineClamp={1}
                                >
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
                            <MantineIcon
                                icon={IconRobotFace}
                                color="ldGray.6"
                            />
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
                            <Group
                                gap="xs"
                                wrap="nowrap"
                                justify="space-between"
                            >
                                <Text fz="xs" c="ldGray.7" fw={500}>
                                    {formatReviewDate(signal.createdAt)}
                                </Text>
                                <Tooltip
                                    label="Open AI thread preview"
                                    withArrow
                                >
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
                                                    signal.finding
                                                        ?.reviewItemUuid,
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
        enableRowSelection: (row) =>
            !isTerminalReviewItem(row.original) &&
            !isExampleReviewItem(row.original.uuid),
        mantineSelectCheckboxProps: { size: 'xs' },
        mantineSelectAllCheckboxProps: { size: 'xs' },
        displayColumnDefOptions: {
            'mrt-row-select': {
                size: 28,
                minSize: 28,
                maxSize: 28,
                enableResizing: false,
            },
        },
        getRowId: (row) => row.uuid,
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
                padding: `${theme.spacing.sm} ${theme.spacing.md}`,
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
            // Anchor the tour to the first row so it spotlights the whole finding.
            const rowAnchor =
                row.index === 0 ? { 'data-tour': 'reviews-row' } : {};

            if (isExampleReviewItem(reviewItem.uuid)) {
                return { className: styles.exampleRow, ...rowAnchor };
            }

            const isSelected = selectedReviewItemUuid === reviewItem.uuid;
            const latestFinding = reviewItem.latestFinding;

            return {
                className: styles.bodyRow,
                style: {
                    cursor: latestFinding ? 'pointer' : 'default',
                    backgroundColor: isSelected
                        ? theme.colors.ldGray[0]
                        : undefined,
                },
                onClick: latestFinding
                    ? () =>
                          onReviewItemSelect?.({
                              projectUuid: latestFinding.projectUuid,
                              agentUuid: latestFinding.agentUuid,
                              threadUuid: latestFinding.threadUuid,
                              reviewItemUuid: reviewItem.uuid,
                          })
                    : undefined,
                ...rowAnchor,
            };
        },
        renderTopToolbar: ({ table: tableInstance }) => {
            const selectedRows = tableInstance
                .getFilteredSelectedRowModel()
                .flatRows.map((row) => row.original);

            const dismissSelected = () => {
                selectedRows.forEach((reviewItem) => {
                    updateStatus.mutate({
                        fingerprint: reviewItem.fingerprint,
                        body: {
                            status: 'dismissed',
                            dismissedReason: 'not_actionable',
                        },
                    });
                });
                tableInstance.resetRowSelection();
            };

            return renderReviewsToolbar({
                visibleCount: filteredReviewItems.length,
                totalCount: searchFilteredReviewItems.length,
                noun: 'finding',
                isLoading,
                surface: 'findings',
                selectedCount: selectedRows.length,
                isDismissingSelected: updateStatus.isLoading,
                onClearSelection: () => tableInstance.resetRowSelection(),
                onDismissSelected:
                    selectedRows.length > 0 ? dismissSelected : undefined,
            });
        },
        emptyState: {
            entityName: 'findings',
            emptyMessage:
                'Nothing to review yet. When an agent answer looks wrong, it shows up here.',
            search,
            hasActiveFilters,
            onClearFilters: clearAllFilters,
        },
        state: {
            showProgressBars: false,
            showSkeletons: isLoading,
            density: 'md',
            rowSelection,
        },
        onRowSelectionChange: handleRowSelectionChange,
        mantineLoadingOverlayProps: {
            loaderProps: {
                color: 'gray',
            },
        },
    });

    const _signalTable = useContentTable({
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
                noun: 'turn',
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
            <ContentTable table={table} />
        </Box>
    );
};

export default AiAgentAdminReviewItemsTable;
