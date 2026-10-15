import {
    getVisibleAiAgentReviewRootCauses,
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
} from '@mantine/core';
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
import { Trans, useTranslation } from 'react-i18next';
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
import i18n from '../../../../../i18n/i18n';
import useApp from '../../../../../providers/App/useApp';
import {
    useAiAgentAdminAgents,
    useAiAgentAdminReviewItems,
    useAiAgentAdminReviewSignals,
    useUpdateAiAgentReviewItemStatus,
} from '../../hooks/useAiAgentAdmin';
import { AgentNamePill } from '../AgentNamePill';
import styles from './AiAgentAdminReviewItemsTable.module.css';
import { getExampleReviewItems, isExampleReviewItem } from './onboarding';
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
    getReviewItemAgentUuid,
    getReviewItemProjectUuid,
    getSuggestedNextStep,
    getWhatHappened,
    getWhyText,
    reviewRootCauseColors,
    getRootCauseLabelKey,
    reviewRootCauseLabels,
} from './reviewItemDetails';
import { SearchFilter } from './SearchFilter';

const ACTIVE_REVIEW_ITEM_STATUSES: AiAgentReviewItemStatus[] = [
    'triage',
    'open',
    'in_progress',
];

const reviewItemStatusLabelKeys: Record<AiAgentReviewItemStatus, string> = {
    triage: 'reviews.lanes.needsTriage',
    open: 'reviews.lanes.todo',
    in_progress: 'reviews.lanes.inProgress',
    resolved: 'reviews.statuses.resolved',
    dismissed: 'reviews.statuses.dismissed',
    duplicate: 'reviews.statuses.duplicate',
};

const signalLabelKeys: Record<AiAgentTurnSignal, string> = {
    normal_refinement: 'reviewsTable.signals.normalRefinement',
    implicit_correction: 'reviewsTable.signals.implicitCorrection',
    explicit_dispute: 'reviewsTable.signals.explicitDispute',
    retry_after_failure: 'reviewsTable.signals.retryAfterFailure',
    output_shape_correction: 'reviewsTable.signals.outputShapeCorrection',
    new_question: 'reviewsTable.signals.newQuestion',
    acceptance_or_continuation: 'reviewsTable.signals.acceptanceOrContinuation',
    product_capability_request: 'reviewsTable.signals.productCapabilityRequest',
    human_intervention: 'reviewsTable.signals.humanIntervention',
    standing_instruction: 'reviewsTable.signals.standingInstruction',
    ambiguous: 'reviewsTable.signals.ambiguous',
};

const tr = (key: string, options?: Record<string, unknown>) =>
    i18n.t(`reviewsTable.${key}`, { ns: 'aiCopilotAdmin', ...options });

type ReviewSurface = 'findings' | 'signals';

// Manual issues have no source thread, so the thread coordinates are null and
// the detail modal renders from the review item alone.
export type AiAgentAdminReviewItemPreviewTarget = {
    projectUuid: string | null;
    agentUuid: string | null;
    threadUuid: string | null;
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
    initialProjectUuids?: string[];
    initialAgentUuids?: string[];
};

const getSignalResultLabel = (signal: AiAgentReviewSignalSummary): string => {
    if (signal.finding) {
        return reviewRootCauseLabels[signal.finding.primaryRootCause];
    }

    return signal.promotedToFinding ? tr('findingPending') : tr('signalOnly');
};

const getSignalWhyText = (signal: AiAgentReviewSignalSummary): string =>
    signal.promotionReason ??
    signal.finding?.recommendation?.rationale ??
    tr('signalWhyFallback');

const getSignalActionText = (signal: AiAgentReviewSignalSummary): string => {
    if (signal.finding?.recommendation) {
        return getRecommendationActionLabel(
            signal.finding.recommendation.actionType,
        );
    }

    if (signal.promotedToFinding) {
        return tr('reviewFinding');
    }

    return tr('noAdminAction');
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
    const { t } = useTranslation('aiCopilotAdmin');
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
                        ? t('reviewsTable.clickToCollapse')
                        : t('reviewsTable.clickToExpand')
                    : undefined
            }
        >
            {children}
        </Text>
    );
};

const SuggestedStep = ({ children }: { children: string }) => {
    const { t } = useTranslation('aiCopilotAdmin');
    return (
        <Tooltip
            label={t('reviewsTable.suggestedStep', { step: children })}
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
};

// Plain-English gloss for each root cause + which two are fixable from this page.
const rootCauseHelp: Record<
    AiAgentRootCause,
    { descKey: string; opensPr: boolean }
> = {
    semantic_layer: {
        descKey: 'reviewsTable.rootCauseHelp.semanticLayer',
        opensPr: true,
    },
    project_context: {
        descKey: 'reviewsTable.rootCauseHelp.projectContext',
        opensPr: true,
    },
    agent_configuration: {
        descKey: 'reviewsTable.rootCauseHelp.agentConfiguration',
        opensPr: false,
    },
    product_capability: {
        descKey: 'reviewsTable.rootCauseHelp.productCapability',
        opensPr: false,
    },
    runtime_reliability: {
        descKey: 'reviewsTable.rootCauseHelp.runtimeReliability',
        opensPr: false,
    },
    feedback_quality: {
        descKey: 'reviewsTable.rootCauseHelp.feedbackQuality',
        opensPr: false,
    },
    not_a_failure: {
        descKey: 'reviewsTable.rootCauseHelp.notAFailure',
        opensPr: false,
    },
    ambiguous: {
        descKey: 'reviewsTable.rootCauseHelp.ambiguous',
        opensPr: false,
    },
};

const rootCauseHelpOrder: AiAgentRootCause[] =
    getVisibleAiAgentReviewRootCauses([
        'semantic_layer',
        'project_context',
        'agent_configuration',
        'product_capability',
        'runtime_reliability',
        'feedback_quality',
        'not_a_failure',
        'ambiguous',
    ]);

const ReviewConceptHelp = () => {
    const { t } = useTranslation('aiCopilotAdmin');
    return (
        <HoverCard
            width={380}
            position="bottom-start"
            withArrow
            openDelay={150}
        >
            <HoverCard.Target>
                <Box className={styles.headerHelpIcon}>
                    <MantineIcon
                        icon={IconHelpCircle}
                        color="ldGray.5"
                        size="sm"
                    />
                </Box>
            </HoverCard.Target>
            <HoverCard.Dropdown>
                <Stack gap="sm">
                    <Stack gap={4}>
                        <Text fz="xs" c="dimmed">
                            <Trans
                                t={t}
                                i18nKey="reviewsTable.conceptHelp"
                                components={{ b: <Text span fw={600} /> }}
                            />
                        </Text>
                    </Stack>
                    <Divider />
                    <Stack gap={6}>
                        <Text fz="xs" fw={600}>
                            {t('reviewsTable.whatWentWrong')}
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
                                    {t(rootCauseHelp[cause].descKey)}
                                    {rootCauseHelp[cause].opensPr && (
                                        <Text span c="ldGray.7" fw={600}>
                                            {t('reviewsTable.fixableHere')}
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
};

const isTerminalReviewItem = (reviewItem: AiAgentReviewItemSummary): boolean =>
    reviewItem.status === 'resolved' ||
    reviewItem.status === 'dismissed' ||
    reviewItem.status === 'duplicate';

const FindingCell = ({
    reviewItem,
}: {
    reviewItem: AiAgentReviewItemSummary;
}) => (
    <Text fw={600} fz="sm" lineClamp={2}>
        {getIssueTitle(reviewItem)}
    </Text>
);

const AiAgentAdminReviewItemsTable = ({
    onReviewItemSelect,
    selectedReviewItemUuid,
    showOnboardingExamples = false,
    initialProjectUuids = [],
    initialAgentUuids = [],
}: AiAgentAdminReviewItemsTableProps) => {
    const { t } = useTranslation('aiCopilotAdmin');
    const theme = useMantineTheme();
    const [search, setSearch] = useState<string | undefined>(undefined);
    const [reviewSurface, _setReviewSurface] =
        useState<ReviewSurface>('findings');
    const [selectedProjectUuids, setSelectedProjectUuids] = useState<string[]>(
        () => initialProjectUuids,
    );
    const [selectedAgentUuids, setSelectedAgentUuids] = useState<string[]>(
        () => initialAgentUuids,
    );
    const [selectedRootCauses, setSelectedRootCauses] = useState<
        AiAgentRootCause[]
    >(DEFAULT_VISIBLE_ROOT_CAUSES);
    const [selectedSignals, setSelectedSignals] = useState<AiAgentTurnSignal[]>(
        [],
    );
    const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
    const [selectedStatuses, setSelectedStatuses] = useState<
        AiAgentReviewItemStatus[]
    >([]);
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
    const deferredSearch = useDeferredValue(search);
    const updateStatus = useUpdateAiAgentReviewItemStatus();

    const { user } = useApp();
    const currentUserUuid = user.data?.userUuid ?? null;
    const orgUsersByUuid = useOrgUsersByUuid();

    // While the tour is running the table always shows the sample rows so the
    // tour is deterministic; otherwise it passes real data straight through
    // (which may be empty or not).
    const exampleReviewItems = useMemo(() => getExampleReviewItems(t), [t]);
    const selectReviewItems = useOnboardingMock(
        exampleReviewItems,
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
            const agentUuid = getReviewItemAgentUuid(reviewItem);
            const projectUuid = getReviewItemProjectUuid(reviewItem);
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
                t(signalLabelKeys[signal.signal]),
                getSignalResultLabel(signal),
                getSignalWhyText(signal),
                getSignalActionText(signal),
                agent?.name,
                project?.name,
            ]
                .filter(Boolean)
                .some((value) => value?.toLowerCase().includes(searchLower));
        },
        [agentsMap, projectsMap, t],
    );

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

    // Agents are scoped after projects so the agent options only ever list
    // agents that appear in the project-filtered view.
    const scopedReviewItems = useMemo(() => {
        if (selectedAgentUuids.length === 0) {
            return projectFilteredReviewItems;
        }
        const agentSet = new Set(selectedAgentUuids);
        return projectFilteredReviewItems.filter((item) => {
            const agentUuid = getReviewItemAgentUuid(item);
            return agentUuid !== null && agentSet.has(agentUuid);
        });
    }, [projectFilteredReviewItems, selectedAgentUuids]);

    const scopedReviewSignals = useMemo(() => {
        if (selectedAgentUuids.length === 0) {
            return projectFilteredReviewSignals;
        }
        const agentSet = new Set(selectedAgentUuids);
        return projectFilteredReviewSignals.filter((signal) =>
            agentSet.has(signal.agentUuid),
        );
    }, [projectFilteredReviewSignals, selectedAgentUuids]);

    const filteredReviewItems = useMemo(() => {
        let items = scopedReviewItems;
        if (selectedStatuses.length > 0) {
            const statusSet = new Set(selectedStatuses);
            items = items.filter((item) => statusSet.has(item.status));
        }
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
    }, [
        scopedReviewItems,
        selectedStatuses,
        selectedRootCauses,
        selectedAssignees,
    ]);

    const filteredReviewSignals = useMemo(() => {
        if (selectedSignals.length === 0) {
            return scopedReviewSignals;
        }
        const signalSet = new Set(selectedSignals);
        return scopedReviewSignals.filter((signal) =>
            signalSet.has(signal.signal),
        );
    }, [scopedReviewSignals, selectedSignals]);

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
                label:
                    projectsMap.get(projectUuid)?.name ??
                    t('reviewsTable.unknownProject'),
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
        t,
    ]);

    const agentFacetOptions = useMemo((): FilterFacetOption[] => {
        const counts = new Map<string, number>();
        const source =
            reviewSurface === 'findings'
                ? projectFilteredReviewItems
                      .filter((item) => {
                          if (selectedRootCauses.length === 0) return true;
                          return selectedRootCauses.includes(
                              item.primaryRootCause,
                          );
                      })
                      .map(getReviewItemAgentUuid)
                : projectFilteredReviewSignals
                      .filter((signal) => {
                          if (selectedSignals.length === 0) return true;
                          return selectedSignals.includes(signal.signal);
                      })
                      .map((signal) => signal.agentUuid);

        for (const agentUuid of source) {
            if (!agentUuid) continue;
            counts.set(agentUuid, (counts.get(agentUuid) ?? 0) + 1);
        }

        return Array.from(counts.entries())
            .map(([agentUuid, count]) => ({
                value: agentUuid,
                label:
                    agentsMap.get(agentUuid)?.name ??
                    t('reviewsTable.unknownAgent'),
                count,
            }))
            .sort(
                (a, b) => b.count - a.count || a.label.localeCompare(b.label),
            );
    }, [
        agentsMap,
        reviewSurface,
        projectFilteredReviewItems,
        projectFilteredReviewSignals,
        selectedRootCauses,
        selectedSignals,
        t,
    ]);

    const rootCauseFacetOptions = useMemo((): FilterFacetOption[] => {
        const counts = new Map<AiAgentRootCause, number>();
        for (const item of scopedReviewItems) {
            counts.set(
                item.primaryRootCause,
                (counts.get(item.primaryRootCause) ?? 0) + 1,
            );
        }
        return (Object.keys(reviewRootCauseLabels) as AiAgentRootCause[])
            .map((rootCause) => ({
                value: rootCause,
                label: t(getRootCauseLabelKey(rootCause)),
                count: counts.get(rootCause) ?? 0,
            }))
            .sort(
                (a, b) => b.count - a.count || a.label.localeCompare(b.label),
            );
    }, [scopedReviewItems, t]);

    const statusFacetOptions = useMemo((): FilterFacetOption[] => {
        const counts = new Map<AiAgentReviewItemStatus, number>();
        for (const item of scopedReviewItems) {
            counts.set(item.status, (counts.get(item.status) ?? 0) + 1);
        }
        return ACTIVE_REVIEW_ITEM_STATUSES.map((status) => ({
            value: status,
            label: t(reviewItemStatusLabelKeys[status]),
            count: counts.get(status) ?? 0,
        }));
    }, [scopedReviewItems, t]);

    const assigneeFacetOptions = useMemo(
        (): FilterFacetOption[] =>
            buildAssigneeFacetOptions({
                items: scopedReviewItems,
                usersByUuid: orgUsersByUuid,
                currentUserUuid,
            }),
        [scopedReviewItems, orgUsersByUuid, currentUserUuid],
    );

    const _signalFacetOptions = useMemo((): FilterFacetOption[] => {
        const counts = new Map<AiAgentTurnSignal, number>();
        for (const signal of scopedReviewSignals) {
            counts.set(signal.signal, (counts.get(signal.signal) ?? 0) + 1);
        }
        return (Object.keys(signalLabelKeys) as AiAgentTurnSignal[])
            .map((turnSignal) => ({
                value: turnSignal,
                label: t(signalLabelKeys[turnSignal]),
                count: counts.get(turnSignal) ?? 0,
            }))
            .sort(
                (a, b) => b.count - a.count || a.label.localeCompare(b.label),
            );
    }, [scopedReviewSignals, t]);

    const hasDefaultRootCauseSelection =
        selectedRootCauses.length === DEFAULT_VISIBLE_ROOT_CAUSES.length &&
        DEFAULT_VISIBLE_ROOT_CAUSES.every((rootCause) =>
            selectedRootCauses.includes(rootCause),
        );

    const hasActiveFilters =
        selectedProjectUuids.length > 0 ||
        selectedAgentUuids.length > 0 ||
        !hasDefaultRootCauseSelection ||
        selectedSignals.length > 0 ||
        selectedAssignees.length > 0 ||
        selectedStatuses.length > 0;

    const clearAllFilters = useCallback(() => {
        setSelectedProjectUuids([]);
        setSelectedAgentUuids([]);
        setSelectedRootCauses(DEFAULT_VISIBLE_ROOT_CAUSES);
        setSelectedSignals([]);
        setSelectedAssignees([]);
        setSelectedStatuses([]);
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
        noun: 'issue' | 'turn';
        isLoading: boolean;
        surface: ReviewSurface;
        selectedCount?: number;
        isDismissingSelected?: boolean;
        onClearSelection?: () => void;
        onDismissSelected?: () => void;
    }) => {
        const hasSelection = selectedCount > 0;
        const countLabel = toolbarLoading
            ? t('reviewsTable.loading')
            : hasActiveFilters && visibleCount !== totalCount
              ? t(
                    noun === 'issue'
                        ? 'reviewsTable.countOfIssues'
                        : 'reviewsTable.countOfTurns',
                    { visible: visibleCount, count: totalCount },
                )
              : t(
                    noun === 'issue'
                        ? 'reviewsTable.countIssues'
                        : 'reviewsTable.countTurns',
                    { count: visibleCount },
                );
        const helperCopy = t('reviewsTable.helper');

        return (
            <Box>
                <Group py="lg" px="xl" justify="space-between">
                    <Group gap="sm" wrap="wrap" className={styles.toolbarGroup}>
                        <SearchFilter
                            search={search}
                            setSearch={setSearch}
                            placeholder={t('reviewsTable.searchPlaceholder')}
                        />

                        <Group
                            gap={6}
                            wrap="nowrap"
                            className={styles.toolbarHeading}
                        >
                            <Text fz="sm" fw={600}>
                                {t('reviewsTable.issues')}
                            </Text>
                            <ReviewConceptHelp />
                        </Group>

                        <FilterFacet
                            label={t('reviewsTable.project')}
                            icon={IconBox}
                            options={projectFacetOptions}
                            selected={selectedProjectUuids}
                            onChange={setSelectedProjectUuids}
                            emptyLabel={t('reviewsTable.noProjects')}
                            tooltipLabel={t('reviewsTable.filterByProject')}
                        />
                        <FilterFacet
                            label={t('reviewsTable.agent')}
                            icon={IconRobotFace}
                            options={agentFacetOptions}
                            selected={selectedAgentUuids}
                            onChange={setSelectedAgentUuids}
                            emptyLabel={t('reviewsTable.noAgents')}
                            tooltipLabel={t('reviewsTable.filterByAgent')}
                        />
                        <FilterFacet
                            label={t('reviewsTable.cause')}
                            icon={IconTag}
                            options={rootCauseFacetOptions}
                            selected={selectedRootCauses}
                            onChange={(values) =>
                                setSelectedRootCauses(
                                    values as AiAgentRootCause[],
                                )
                            }
                            emptyLabel={t('reviewsTable.noCauses')}
                            tooltipLabel={t('reviewsTable.filterByCause')}
                        />
                        <FilterFacet
                            label={t('reviewsTable.status')}
                            icon={IconListCheck}
                            options={statusFacetOptions}
                            selected={selectedStatuses}
                            onChange={(values) =>
                                setSelectedStatuses(
                                    values as AiAgentReviewItemStatus[],
                                )
                            }
                            emptyLabel={t('reviewsTable.noStatuses')}
                            tooltipLabel={t('reviewsTable.filterByStatus')}
                        />
                        <FilterFacet
                            label={t('reviewsTable.assignee')}
                            icon={IconUser}
                            options={assigneeFacetOptions}
                            selected={selectedAssignees}
                            onChange={setSelectedAssignees}
                            emptyLabel={t('reviewsTable.noAssignees')}
                            tooltipLabel={t('reviewsTable.filterByAssignee')}
                        />
                        {hasActiveFilters && (
                            <Button
                                variant="subtle"
                                color="gray"
                                size="xs"
                                leftSection={
                                    <MantineIcon icon={IconFilterX} size="xs" />
                                }
                                onClick={clearAllFilters}
                            >
                                {t('reviewsTable.clearFilters')}
                            </Button>
                        )}
                    </Group>

                    <Group gap="sm" wrap="nowrap">
                        {surface === 'findings' &&
                            hasSelection &&
                            onDismissSelected && (
                                <>
                                    <Text fz="sm" c="dimmed" fw={500}>
                                        {t('reviewsTable.selectedCount', {
                                            count: selectedCount,
                                        })}
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
                                        {t('reviewsTable.dismissIssues')}
                                    </Button>
                                    {onClearSelection && (
                                        <Button
                                            size="xs"
                                            variant="subtle"
                                            color="gray"
                                            onClick={onClearSelection}
                                        >
                                            {t('reviewsTable.clear')}
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
                header: t('reviewsTable.columns.cause'),
                enableSorting: false,
                size: 170,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconTag} color="dimmed" />
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
                                    label={t('reviewsTable.example')}
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
                header: t('reviewsTable.columns.finding'),
                enableSorting: false,
                size: 700,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconListCheck} color="dimmed" />
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
                header: t('reviewsTable.columns.action'),
                enableSorting: false,
                size: 190,
                Header: ({ column }) => (
                    <Group gap={4}>
                        <MantineIcon icon={IconArrowRight} color="dimmed" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) =>
                    isExampleReviewItem(row.original.uuid) ? (
                        <Button size="compact-xs" variant="default" disabled>
                            {t('reviewsTable.createPr')}
                        </Button>
                    ) : (
                        <ReviewItemActions reviewItem={row.original} />
                    ),
            },
        ],
        [t],
    );

    const signalColumns: ContentTableColumnDef<AiAgentReviewSignalSummary>[] =
        useMemo(
            () => [
                {
                    accessorKey: 'promotedToFinding',
                    header: t('reviewsTable.columns.result'),
                    enableSorting: false,
                    size: 110,
                    Header: ({ column }) => (
                        <Group gap="two" wrap="nowrap">
                            <MantineIcon icon={IconTag} color="dimmed" />
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
                                    label={t(
                                        `reviewsTable.confidence.${signal.confidence}`,
                                    )}
                                >
                                    <Box className={styles.confidenceIcon}>
                                        <MantineIcon
                                            icon={ConfidenceIcon}
                                            color="dimmed"
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
                    header: t('reviewsTable.columns.signal'),
                    enableSorting: false,
                    size: 300,
                    Header: ({ column }) => (
                        <Group gap="two">
                            <MantineIcon icon={IconInfoCircle} color="dimmed" />
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
                                        label={t(
                                            signalLabelKeys[signal.signal],
                                        )}
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
                    header: t('reviewsTable.columns.turn'),
                    enableSorting: false,
                    size: 300,
                    Header: ({ column }) => (
                        <Group gap="two">
                            <MantineIcon icon={IconListCheck} color="dimmed" />
                            {column.columnDef.header}
                        </Group>
                    ),
                    Cell: ({ row }) => {
                        const signal = row.original;
                        return (
                            <Stack gap={2}>
                                <Text fw={600} fz="sm" lineClamp={1}>
                                    {signal.prompt}
                                </Text>
                                <ExpandableText lineClamp={1}>
                                    {signal.errorMessage ??
                                        signal.responsePreview ??
                                        t('reviewsTable.noResponse')}
                                </ExpandableText>
                            </Stack>
                        );
                    },
                },
                {
                    accessorKey: 'agentUuid',
                    header: t('reviewsTable.columns.agent'),
                    enableSorting: false,
                    size: 100,
                    Header: ({ column }) => (
                        <Group gap="two">
                            <MantineIcon icon={IconRobotFace} color="dimmed" />
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
                                    color="dimmed"
                                    size="sm"
                                />
                                <Text fz="sm" lineClamp={1}>
                                    {project?.name ??
                                        t('reviewsTable.unknownAgent')}
                                </Text>
                            </Group>
                        );
                    },
                },
                {
                    accessorKey: 'createdAt',
                    header: t('reviewsTable.columns.reviewed'),
                    enableSorting: true,
                    size: 150,
                    Header: ({ column }) => (
                        <Group gap="two">
                            <MantineIcon icon={IconClock} color="dimmed" />
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
                                    label={t('reviewsTable.openThreadPreview')}
                                >
                                    <ActionIcon
                                        size="sm"
                                        aria-label={t(
                                            'reviewsTable.openThreadPreview',
                                        )}
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
            [agentsMap, onReviewItemSelect, projectsMap, t],
        );

    const table = useContentTable({
        columns,
        data: filteredReviewItems,
        enableColumnResizing: false,
        enablePagination: false,
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
        mantineTableContainerProps: {
            style: {
                maxHeight: 'calc(100dvh - 350px)',
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

            if (isExampleReviewItem(reviewItem.uuid)) {
                return { className: styles.exampleRow };
            }

            const isSelected = selectedReviewItemUuid === reviewItem.uuid;
            const latestFinding = reviewItem.latestFinding;

            return {
                className: styles.bodyRow,
                style: {
                    cursor: 'pointer',
                    backgroundColor: isSelected
                        ? theme.colors.ldGray[0]
                        : undefined,
                },
                onClick: () =>
                    onReviewItemSelect?.({
                        projectUuid:
                            latestFinding?.projectUuid ??
                            reviewItem.projectUuid,
                        agentUuid:
                            latestFinding?.agentUuid ?? reviewItem.agentUuid,
                        threadUuid: latestFinding?.threadUuid ?? null,
                        reviewItemUuid: reviewItem.uuid,
                    }),
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
                noun: 'issue',
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
            entityName: t('reviewsTable.entityName'),
            title: t('reviewsTable.emptyTitle'),
            description: t('reviewsTable.emptyDescription'),
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
        enablePagination: false,
        enableSorting: true,
        enableTopToolbar: true,
        enableBottomToolbar: false,
        mantineTableContainerProps: {
            style: {
                maxHeight: 'calc(100dvh - 350px)',
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
