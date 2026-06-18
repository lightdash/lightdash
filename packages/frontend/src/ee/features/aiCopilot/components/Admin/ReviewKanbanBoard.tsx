import {
    DndContext,
    DragOverlay,
    KeyboardSensor,
    PointerSensor,
    useDraggable,
    useDroppable,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragOverEvent,
    type DragStartEvent,
} from '@dnd-kit/core';
import {
    type AiAgentReviewItemSummary,
    type AiAgentRootCause,
} from '@lightdash/common';
import {
    Badge,
    Box,
    Button,
    Divider,
    Group,
    Stack,
    Text,
} from '@mantine-8/core';
import { IconBox, IconTag } from '@tabler/icons-react';
import { type FC, useDeferredValue, useMemo, useState } from 'react';
import FilterFacet, {
    type FilterFacetOption,
} from '../../../../../components/common/FilterFacet';
import { useProjects } from '../../../../../hooks/useProjects';
import {
    useAiAgentAdminReviewItems,
    useCreateAiAgentReviewItemWriteback,
    useUpdateAiAgentReviewItemStatus,
} from '../../hooks/useAiAgentAdmin';
import { type AiAgentAdminReviewItemPreviewTarget } from './AiAgentAdminReviewItemsTable';
import { EXAMPLE_REVIEW_ITEMS } from './onboarding';
import {
    DEFAULT_VISIBLE_ROOT_CAUSES,
    getIssueTitle,
    reviewRootCauseLabels,
} from './reviewItemDetails';
import styles from './ReviewKanbanBoard.module.css';
import { ReviewKanbanCard } from './ReviewKanbanCard';
import {
    BOARD_STATUSES,
    getReviewLane,
    getStartWritebackKind,
    LANE_TARGET_STATUS,
    partitionInProgress,
    REVIEW_LANES,
    type ReviewLane,
} from './reviewLane';
import { SearchFilter } from './SearchFilter';

const VISIBLE_PER_LANE = 10;

const LANE_IDS = new Set<string>(REVIEW_LANES.map((l) => l.id));

type Props = {
    selectedReviewItemUuid?: string | null;
    onReviewItemSelect: (target: AiAgentAdminReviewItemPreviewTarget) => void;
    showOnboardingExamples?: boolean;
};

const toTarget = (
    item: AiAgentReviewItemSummary,
): AiAgentAdminReviewItemPreviewTarget | null => {
    const finding = item.latestFinding;
    if (!finding) return null;
    return {
        projectUuid: finding.projectUuid,
        agentUuid: finding.agentUuid,
        threadUuid: finding.threadUuid,
        reviewItemUuid: item.uuid,
    };
};

type DraggableCardProps = {
    item: AiAgentReviewItemSummary;
    isSelected: boolean;
    onSelect: () => void;
};

const DraggableCard: FC<DraggableCardProps> = ({
    item,
    isSelected,
    onSelect,
}) => {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: item.uuid,
    });

    return (
        <Box
            ref={setNodeRef}
            className={isDragging ? styles.cardGhost : undefined}
            {...listeners}
            {...attributes}
        >
            <ReviewKanbanCard
                item={item}
                isSelected={isSelected}
                onSelect={onSelect}
            />
        </Box>
    );
};

type DroppableLaneProps = {
    laneId: ReviewLane;
    isDraggingValidTarget: boolean;
    children: React.ReactNode;
};

const DroppableLane: FC<DroppableLaneProps> = ({
    laneId,
    isDraggingValidTarget,
    children,
}) => {
    const { setNodeRef, isOver } = useDroppable({ id: laneId });
    const highlight = isOver && isDraggingValidTarget;

    return (
        <Box
            ref={setNodeRef}
            className={`${styles.laneScroll}${highlight ? ` ${styles.laneOver}` : ''}`}
        >
            {children}
        </Box>
    );
};

export const ReviewKanbanBoard: FC<Props> = ({
    selectedReviewItemUuid,
    onReviewItemSelect,
    showOnboardingExamples = false,
}) => {
    const [search, setSearch] = useState<string | undefined>(undefined);
    const deferredSearch = useDeferredValue(search);
    const [selectedProjectUuids, setSelectedProjectUuids] = useState<string[]>(
        [],
    );
    const [selectedRootCauses, setSelectedRootCauses] = useState<
        AiAgentRootCause[]
    >(DEFAULT_VISIBLE_ROOT_CAUSES);
    const { data } = useAiAgentAdminReviewItems({ statuses: BOARD_STATUSES });
    const { data: projects } = useProjects();
    const [expandedLanes, setExpandedLanes] = useState<
        Partial<Record<ReviewLane, boolean>>
    >({});
    const [draggingItemUuid, setDraggingItemUuid] = useState<string | null>(
        null,
    );
    const [overLaneId, setOverLaneId] = useState<ReviewLane | null>(null);

    const updateStatus = useUpdateAiAgentReviewItemStatus();
    const createWriteback = useCreateAiAgentReviewItemWriteback();

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor),
    );

    const projectsMap = useMemo(() => {
        if (!projects) return new Map<string, { name: string }>();
        return new Map(projects.map((p) => [p.projectUuid, p]));
    }, [projects]);

    const allItems = useMemo<AiAgentReviewItemSummary[]>(() => {
        if (showOnboardingExamples && (!data || data.length === 0)) {
            return EXAMPLE_REVIEW_ITEMS as AiAgentReviewItemSummary[];
        }
        return data ?? [];
    }, [data, showOnboardingExamples]);

    const searchFilteredItems = useMemo<AiAgentReviewItemSummary[]>(() => {
        const q = deferredSearch?.trim().toLowerCase();
        if (!q) return allItems;
        return allItems.filter((item) =>
            getIssueTitle(item).toLowerCase().includes(q),
        );
    }, [allItems, deferredSearch]);

    const projectFilteredItems = useMemo<AiAgentReviewItemSummary[]>(() => {
        if (selectedProjectUuids.length === 0) return searchFilteredItems;
        const projectSet = new Set(selectedProjectUuids);
        return searchFilteredItems.filter((item) => {
            const projectUuid =
                item.latestFinding?.projectUuid ?? item.projectUuid ?? null;
            return projectUuid !== null && projectSet.has(projectUuid);
        });
    }, [searchFilteredItems, selectedProjectUuids]);

    const items = useMemo<AiAgentReviewItemSummary[]>(() => {
        if (selectedRootCauses.length === 0) return projectFilteredItems;
        const rootCauseSet = new Set(selectedRootCauses);
        return projectFilteredItems.filter((item) =>
            rootCauseSet.has(item.primaryRootCause),
        );
    }, [projectFilteredItems, selectedRootCauses]);

    const projectFacetOptions = useMemo((): FilterFacetOption[] => {
        const counts = new Map<string, number>();
        for (const item of searchFilteredItems.filter((item) => {
            if (selectedRootCauses.length === 0) return true;
            return selectedRootCauses.includes(item.primaryRootCause);
        })) {
            const projectUuid =
                item.latestFinding?.projectUuid ?? item.projectUuid ?? null;
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
                (a, b) =>
                    b.count - a.count ||
                    String(a.label).localeCompare(String(b.label)),
            );
    }, [projectsMap, searchFilteredItems, selectedRootCauses]);

    const rootCauseFacetOptions = useMemo((): FilterFacetOption[] => {
        const counts = new Map<AiAgentRootCause, number>();
        for (const item of projectFilteredItems) {
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
                (a, b) =>
                    b.count - a.count ||
                    String(a.label).localeCompare(String(b.label)),
            );
    }, [projectFilteredItems]);

    const lanes = useMemo(() => {
        const byLane: Record<ReviewLane, AiAgentReviewItemSummary[]> = {
            needs_triage: [],
            todo: [],
            in_progress: [],
            done: [],
        };
        items.forEach((item) => byLane[getReviewLane(item)].push(item));
        return byLane;
    }, [items]);

    // Resolve the item being dragged to check if a given lane is a valid target
    const draggingItem = draggingItemUuid
        ? (items.find((item) => item.uuid === draggingItemUuid) ?? null)
        : null;

    const isValidTarget = (laneId: ReviewLane): boolean => {
        if (!draggingItem) return false;
        const targetStatus = LANE_TARGET_STATUS[laneId];
        return targetStatus !== null && targetStatus !== draggingItem.status;
    };

    const handleDragStart = ({ active }: DragStartEvent) => {
        setDraggingItemUuid(String(active.id));
    };

    const handleDragOver = ({ over }: DragOverEvent) => {
        const id = over?.id ? String(over.id) : null;
        const next = id && LANE_IDS.has(id) ? (id as ReviewLane) : null;
        setOverLaneId((prev) => (prev === next ? prev : next));
    };

    const handleDragEnd = ({ active, over }: DragEndEvent) => {
        setDraggingItemUuid(null);
        setOverLaneId(null);
        if (!over) return;
        if (!LANE_IDS.has(String(over.id))) return;
        const targetLane = over.id as ReviewLane;
        const draggedItem = items.find((item) => item.uuid === active.id);
        if (!draggedItem) return;

        const targetStatus = LANE_TARGET_STATUS[targetLane];
        if (targetStatus === null) return;

        if (targetStatus !== draggedItem.status) {
            updateStatus.mutate({
                fingerprint: draggedItem.fingerprint,
                body: { status: targetStatus, dismissedReason: null },
            });
            if (targetLane === 'in_progress') {
                const kind = getStartWritebackKind(draggedItem);
                if (kind === 'mutate')
                    createWriteback.mutate(draggedItem.fingerprint);
            }
        }
    };

    const handleDragCancel = () => {
        setDraggingItemUuid(null);
        setOverLaneId(null);
    };

    return (
        <Stack gap="sm" style={{ minHeight: 0, flex: 1 }}>
            <Group gap="sm" wrap="wrap" className={styles.toolbar}>
                <SearchFilter
                    search={search}
                    setSearch={setSearch}
                    placeholder="Search issues"
                />
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
                        setSelectedRootCauses(values as AiAgentRootCause[])
                    }
                    emptyLabel="No root causes in current view"
                    tooltipLabel="Filter by root cause"
                />
            </Group>
            <Box className={styles.boardWrapper}>
                <DndContext
                    sensors={sensors}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDragEnd={handleDragEnd}
                    onDragCancel={handleDragCancel}
                >
                    <Box className={styles.board}>
                        {REVIEW_LANES.map((lane) => {
                            const all = lanes[lane.id];
                            const isExpanded = expandedLanes[lane.id] ?? false;
                            const displayed =
                                isExpanded || all.length <= VISIBLE_PER_LANE
                                    ? all
                                    : all.slice(0, VISIBLE_PER_LANE);
                            const hasMore = all.length > VISIBLE_PER_LANE;

                            const { active, rest } =
                                lane.id === 'in_progress'
                                    ? partitionInProgress(displayed)
                                    : { active: [], rest: displayed };
                            const cards =
                                lane.id === 'in_progress'
                                    ? [...active, ...rest]
                                    : displayed;

                            return (
                                <Box key={lane.id} className={styles.lane}>
                                    <Group gap={8} px={4} pb="xs">
                                        <Box
                                            w={8}
                                            h={8}
                                            bg={`${lane.color}.5`}
                                            style={{ borderRadius: 3 }}
                                        />
                                        <Text fz="sm" fw={650}>
                                            {lane.label}
                                        </Text>
                                        <Badge
                                            color="gray"
                                            variant="light"
                                            size="sm"
                                        >
                                            {all.length}
                                        </Badge>
                                    </Group>
                                    <DroppableLane
                                        laneId={lane.id}
                                        isDraggingValidTarget={isValidTarget(
                                            lane.id,
                                        )}
                                    >
                                        {cards.length === 0 ? (
                                            <Box className={styles.emptyLane}>
                                                <Text fz="xs" c="dimmed">
                                                    No issues
                                                </Text>
                                            </Box>
                                        ) : (
                                            <>
                                                {cards.map((item, index) => {
                                                    const showDivider =
                                                        lane.id ===
                                                            'in_progress' &&
                                                        active.length > 0 &&
                                                        index === active.length;
                                                    const target =
                                                        toTarget(item);
                                                    return (
                                                        <Box key={item.uuid}>
                                                            {showDivider && (
                                                                <Divider
                                                                    my="xs"
                                                                    label="Other"
                                                                    labelPosition="left"
                                                                />
                                                            )}
                                                            <DraggableCard
                                                                item={item}
                                                                isSelected={
                                                                    selectedReviewItemUuid ===
                                                                    item.uuid
                                                                }
                                                                onSelect={() => {
                                                                    if (target)
                                                                        onReviewItemSelect(
                                                                            target,
                                                                        );
                                                                }}
                                                            />
                                                        </Box>
                                                    );
                                                })}
                                                {hasMore && (
                                                    <Button
                                                        variant="subtle"
                                                        size="xs"
                                                        color="gray"
                                                        fullWidth
                                                        onClick={() =>
                                                            setExpandedLanes(
                                                                (prev) => ({
                                                                    ...prev,
                                                                    [lane.id]:
                                                                        !isExpanded,
                                                                }),
                                                            )
                                                        }
                                                    >
                                                        {isExpanded
                                                            ? 'Show less'
                                                            : `Show all (${all.length})`}
                                                    </Button>
                                                )}
                                                {overLaneId === lane.id &&
                                                    isValidTarget(lane.id) && (
                                                        <Box
                                                            className={
                                                                styles.dropPlaceholder
                                                            }
                                                        />
                                                    )}
                                            </>
                                        )}
                                    </DroppableLane>
                                </Box>
                            );
                        })}
                    </Box>
                    <DragOverlay>
                        {draggingItem && (
                            <Box className={styles.dragOverlayCard}>
                                <ReviewKanbanCard
                                    item={draggingItem}
                                    isSelected={false}
                                    onSelect={() => {}}
                                />
                            </Box>
                        )}
                    </DragOverlay>
                </DndContext>
            </Box>
        </Stack>
    );
};
