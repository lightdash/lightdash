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
    Divider,
    Group,
    Paper,
    SegmentedControl,
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
    IconHelpCircle,
    IconInfoCircle,
    IconListCheck,
    IconMessages,
    IconRobotFace,
    IconTag,
    IconTriangle,
} from '@tabler/icons-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { LightdashUserAvatar } from '../../../../../components/Avatar';
import {
    ContentTable,
    useContentTable,
    type MRT_ColumnDef,
} from '../../../../../components/common/ContentTable';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useProjects } from '../../../../../hooks/useProjects';
import {
    useAiAgentAdminAgents,
    useAiAgentAdminReviewItems,
    useAiAgentAdminReviewSignals,
} from '../../hooks/useAiAgentAdmin';
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

const CategoryToken = ({
    children,
    secondary = false,
}: {
    children: string;
    secondary?: boolean;
}) => (
    <Box
        className={`${styles.categoryToken} ${
            secondary ? styles.categoryTokenSecondary : ''
        }`}
    >
        <Text
            fz="xs"
            fw={secondary ? 450 : 500}
            className={
                secondary
                    ? styles.categoryTokenSecondaryText
                    : styles.categoryTokenText
            }
        >
            {children}
        </Text>
    </Box>
);

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
    const canExpand = children.length > lineClamp * 72;

    return (
        <Text
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
            title={canExpand ? 'Click to expand' : undefined}
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
            <Text fz="xs" c="ldGray.7" lineClamp={1}>
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

const AiAgentAdminReviewItemsTable = ({
    onReviewItemSelect,
    selectedReviewItemUuid,
}: AiAgentAdminReviewItemsTableProps) => {
    const theme = useMantineTheme();
    const [search, setSearch] = useState<string | undefined>(undefined);
    const [reviewSurface, setReviewSurface] =
        useState<ReviewSurface>('findings');
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

    const filteredReviewItems = useMemo(() => {
        if (!deferredSearch) return reviewItems;

        const searchLower = deferredSearch.toLowerCase();
        return reviewItems.filter((reviewItem) => {
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
            ]
                .filter(Boolean)
                .some((value) => value?.toLowerCase().includes(searchLower));
        });
    }, [agentsMap, deferredSearch, projectsMap, reviewItems]);

    const filteredReviewSignals = useMemo(() => {
        if (!deferredSearch) return reviewSignals;

        const searchLower = deferredSearch.toLowerCase();
        return reviewSignals.filter((signal) => {
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
        });
    }, [agentsMap, deferredSearch, projectsMap, reviewSignals]);

    const columns: MRT_ColumnDef<AiAgentReviewItemSummary>[] = useMemo(
        () => [
            {
                accessorKey: 'title',
                header: 'Issue',
                enableSorting: false,
                size: 330,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconListCheck} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const reviewItem = row.original;
                    return (
                        <Stack gap={2}>
                            <Text fw={600} fz="sm" c="ldGray.9" lineClamp={1}>
                                {getIssueTitle(reviewItem)}
                            </Text>
                            <ExpandableText lineClamp={1}>
                                {getWhatHappened(reviewItem)}
                            </ExpandableText>
                        </Stack>
                    );
                },
            },
            {
                accessorKey: 'primaryRootCause',
                header: 'Review note',
                enableSorting: false,
                size: 380,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconInfoCircle} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => {
                    const reviewItem = row.original;
                    const subcategory =
                        reviewItem.latestFinding?.subcategories[0];
                    return (
                        <Stack gap={4}>
                            <Group gap={4} wrap="nowrap">
                                <CategoryToken>
                                    {
                                        rootCauseLabels[
                                            reviewItem.primaryRootCause
                                        ]
                                    }
                                </CategoryToken>
                                {subcategory && (
                                    <CategoryToken secondary>
                                        {subcategory.replaceAll('_', ' ')}
                                    </CategoryToken>
                                )}
                                <SuggestedStep>
                                    {getSuggestedNextStep(reviewItem)}
                                </SuggestedStep>
                            </Group>
                            <ExpandableText lineClamp={1}>
                                {getWhyText(reviewItem)}
                            </ExpandableText>
                        </Stack>
                    );
                },
            },
            {
                accessorKey: 'agentUuid',
                header: 'Agent',
                enableSorting: false,
                size: 180,
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

                    if (agent) {
                        return (
                            <Tooltip
                                label={project?.name ?? 'Organization'}
                                withArrow
                                disabled={!project}
                            >
                                <Paper px="xs" w="fit-content" maw="100%">
                                    <Group gap="two" wrap="nowrap">
                                        <LightdashUserAvatar
                                            size={16}
                                            name={agent.name}
                                            src={agent.imageUrl}
                                        />
                                        <Text
                                            fz="sm"
                                            fw={600}
                                            c="ldGray.9"
                                            truncate
                                        >
                                            {agent.name}
                                        </Text>
                                    </Group>
                                </Paper>
                            </Tooltip>
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
                                {project?.name ?? 'Organization'}
                            </Text>
                        </Group>
                    );
                },
            },
            {
                accessorKey: 'lastSeenAt',
                header: 'Last seen',
                enableSorting: true,
                size: 110,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconClock} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => (
                    <Text fz="xs" c="ldGray.7" fw={500}>
                        {formatLastSeenDate(row.original.lastSeenAt)}
                    </Text>
                ),
            },
            {
                id: 'threadPreview',
                header: '',
                enableSorting: false,
                size: 56,
                Cell: ({ row }) => {
                    const reviewItem = row.original;
                    const latestFinding = reviewItem.latestFinding;

                    if (!latestFinding) return null;

                    return (
                        <Tooltip label="Open AI thread preview" withArrow>
                            <ActionIcon
                                variant="subtle"
                                color="gray"
                                aria-label="Open AI thread preview"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onReviewItemSelect?.({
                                        projectUuid: latestFinding.projectUuid,
                                        agentUuid: latestFinding.agentUuid,
                                        threadUuid: latestFinding.threadUuid,
                                        reviewItemUuid: reviewItem.uuid,
                                    });
                                }}
                            >
                                <MantineIcon icon={IconMessages} />
                            </ActionIcon>
                        </Tooltip>
                    );
                },
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
                            <CategoryToken>
                                {getSignalResultLabel(signal)}
                            </CategoryToken>
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
                size: 340,
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
                                <CategoryToken>
                                    {signalLabels[signal.signal]}
                                </CategoryToken>
                                {subcategory && (
                                    <CategoryToken secondary>
                                        {subcategory.replaceAll('_', ' ')}
                                    </CategoryToken>
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
                size: 180,
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
                            <Tooltip
                                label={project?.name ?? 'Unknown project'}
                                withArrow
                                disabled={!project}
                            >
                                <Paper px="xs" w="fit-content" maw="100%">
                                    <Group gap="two" wrap="nowrap">
                                        <LightdashUserAvatar
                                            size={16}
                                            name={agent.name}
                                            src={agent.imageUrl}
                                        />
                                        <Text
                                            fz="sm"
                                            fw={600}
                                            c="ldGray.9"
                                            truncate
                                        >
                                            {agent.name}
                                        </Text>
                                    </Group>
                                </Paper>
                            </Tooltip>
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
                size: 110,
                Header: ({ column }) => (
                    <Group gap="two">
                        <MantineIcon icon={IconClock} color="ldGray.6" />
                        {column.columnDef.header}
                    </Group>
                ),
                Cell: ({ row }) => (
                    <Text fz="xs" c="ldGray.7" fw={500}>
                        {formatLastSeenDate(row.original.createdAt)}
                    </Text>
                ),
            },
            {
                id: 'threadPreview',
                header: '',
                enableSorting: false,
                size: 56,
                Cell: ({ row }) => {
                    const signal = row.original;

                    return (
                        <Tooltip label="Open AI thread preview" withArrow>
                            <ActionIcon
                                variant="subtle"
                                color="gray"
                                aria-label="Open AI thread preview"
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
                style: {
                    backgroundColor: isSelected
                        ? theme.colors.ldGray[1]
                        : undefined,
                },
            };
        },
        renderTopToolbar: () => (
            <Box>
                <Group
                    p={`${theme.spacing.lg} ${theme.spacing.xl}`}
                    justify="space-between"
                >
                    <Group gap="xs">
                        <SearchFilter
                            search={search}
                            setSearch={setSearch}
                            placeholder="Search reviews"
                        />

                        <Divider
                            orientation="vertical"
                            w={1}
                            h={20}
                            style={{
                                alignSelf: 'center',
                            }}
                        />
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
                    </Group>

                    <Box
                        bg="ldGray.1"
                        c="ldGray.9"
                        style={{
                            borderRadius: 6,
                            padding: `${theme.spacing.sm} ${theme.spacing.xs}`,
                            height: 32,
                            display: 'flex',
                            alignItems: 'center',
                        }}
                    >
                        <Text fz="sm" fw={500}>
                            {isLoading
                                ? 'Loading...'
                                : `${filteredReviewItems.length} ${
                                      filteredReviewItems.length === 1
                                          ? 'item'
                                          : 'items'
                                  }`}
                        </Text>
                    </Box>
                </Group>
                <Divider color="ldGray.2" />
            </Box>
        ),
        state: {
            showProgressBars: false,
            showSkeletons: isLoading,
            density: 'md',
        },
        mantineLoadingOverlayProps: {
            loaderProps: {
                color: 'violet',
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
        renderTopToolbar: () => (
            <Box>
                <Group
                    p={`${theme.spacing.lg} ${theme.spacing.xl}`}
                    justify="space-between"
                >
                    <Group gap="xs">
                        <SearchFilter
                            search={search}
                            setSearch={setSearch}
                            placeholder="Search reviews"
                        />

                        <Divider
                            orientation="vertical"
                            w={1}
                            h={20}
                            style={{
                                alignSelf: 'center',
                            }}
                        />
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
                    </Group>

                    <Box
                        bg="ldGray.1"
                        c="ldGray.9"
                        style={{
                            borderRadius: 6,
                            padding: `${theme.spacing.sm} ${theme.spacing.xs}`,
                            height: 32,
                            display: 'flex',
                            alignItems: 'center',
                        }}
                    >
                        <Text fz="sm" fw={500}>
                            {isSignalsLoading
                                ? 'Loading...'
                                : `${filteredReviewSignals.length} ${
                                      filteredReviewSignals.length === 1
                                          ? 'signal'
                                          : 'signals'
                                  }`}
                        </Text>
                    </Box>
                </Group>
                <Divider color="ldGray.2" />
            </Box>
        ),
        state: {
            showProgressBars: false,
            showSkeletons: isSignalsLoading,
            density: 'md',
        },
        mantineLoadingOverlayProps: {
            loaderProps: {
                color: 'violet',
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
