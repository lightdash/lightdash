import {
    closestCorners,
    DndContext,
    DragOverlay,
    KeyboardSensor,
    pointerWithin,
    PointerSensor,
    useDroppable,
    useSensor,
    useSensors,
    type CollisionDetection,
    type DragEndEvent,
    type DragOverEvent,
    type DragStartEvent,
} from '@dnd-kit/core';

// closestCorners can't resolve to an empty lane (a filled lane's card is always
// a closer corner), so dropping into an empty column never registers. Prefer the
// lane/card the pointer is literally within, falling back to closestCorners.
const collisionDetectionStrategy: CollisionDetection = (args) => {
    const pointerCollisions = pointerWithin(args);
    return pointerCollisions.length > 0
        ? pointerCollisions
        : closestCorners(args);
};
import {
    arrayMove,
    SortableContext,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
    type AiAgentReviewItemSummary,
    type AiAgentRootCause,
} from '@lightdash/common';
import { Badge, Box, Button, Group, Stack, Text } from '@mantine-8/core';
import { IconBox, IconTag, IconUser } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { type FC, useDeferredValue, useMemo, useState } from 'react';
import FilterFacet, {
    type FilterFacetOption,
} from '../../../../../components/common/FilterFacet';
import { useOrgUsersByUuid } from '../../../../../hooks/useOrganizationUsers';
import { useProjects } from '../../../../../hooks/useProjects';
import useApp from '../../../../../providers/App/useApp';
import {
    applyOptimisticReviewBoardOrder,
    useAiAgentAdminReviewItems,
    useCreateAiAgentReviewItemWriteback,
    useReorderReviewItems,
    useUpdateAiAgentReviewItemStatus,
} from '../../hooks/useAiAgentAdmin';
import { type AiAgentAdminReviewItemPreviewTarget } from './AiAgentAdminReviewItemsTable';
import { EXAMPLE_REVIEW_ITEMS } from './onboarding';
import {
    buildAssigneeFacetOptions,
    matchesAssigneeFilter,
} from './reviewAssigneeFacet';
import {
    DEFAULT_VISIBLE_ROOT_CAUSES,
    getIssueTitle,
    reviewRootCauseLabels,
} from './reviewItemDetails';
import styles from './ReviewKanbanBoard.module.css';
import { ReviewKanbanCard } from './ReviewKanbanCard';
import { ReviewKanbanCardSkeleton } from './ReviewKanbanCardSkeleton';
import {
    BOARD_STATUSES,
    getReviewLane,
    getStartWritebackKind,
    LANE_TARGET_STATUS,
    REVIEW_LANES,
    type ReviewLane,
} from './reviewLane';
import { SearchFilter } from './SearchFilter';

const VISIBLE_PER_LANE = 10;

// Staggered skeleton counts per lane so the loading board reads naturally.
const SKELETON_COUNTS = [3, 2, 2, 1];

const LANE_IDS = new Set<string>(REVIEW_LANES.map((l) => l.id));

type Props = {
    selectedReviewItemUuid?: string | null;
    onReviewItemSelect: (target: AiAgentAdminReviewItemPreviewTarget) => void;
    showOnboardingExamples?: boolean;
    initialProjectUuids?: string[];
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

type SortableCardProps = {
    item: AiAgentReviewItemSummary;
    isSelected: boolean;
    onSelect: () => void;
};

const SortableCard: FC<SortableCardProps> = ({
    item,
    isSelected,
    onSelect,
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: item.uuid });

    return (
        <Box
            ref={setNodeRef}
            className={`${styles.draggableCard}${
                isDragging ? ` ${styles.cardGhost}` : ''
            }`}
            // dnd-kit drives the per-frame shift that previews where the card
            // will land; this transform/transition can only be inline.
            style={{
                transform: CSS.Translate.toString(transform),
                transition,
            }}
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
    isDragActive: boolean;
    children: React.ReactNode;
};

const DroppableLane: FC<DroppableLaneProps> = ({
    laneId,
    isDragActive,
    children,
}) => {
    const { setNodeRef, isOver } = useDroppable({ id: laneId });

    const classNames = [styles.laneScroll];
    // Every lane accepts a drop now (reorder within, or move across); the
    // sortable gap shows exactly where the card will land.
    if (isOver) classNames.push(styles.laneOver);
    else if (isDragActive) classNames.push(styles.laneValidTarget);

    return (
        <Box ref={setNodeRef} className={classNames.join(' ')}>
            {children}
        </Box>
    );
};

export const ReviewKanbanBoard: FC<Props> = ({
    selectedReviewItemUuid,
    onReviewItemSelect,
    showOnboardingExamples = false,
    initialProjectUuids = [],
}) => {
    const [search, setSearch] = useState<string | undefined>(undefined);
    const deferredSearch = useDeferredValue(search);
    const [selectedProjectUuids, setSelectedProjectUuids] = useState<string[]>(
        () => initialProjectUuids,
    );
    const [selectedRootCauses, setSelectedRootCauses] = useState<
        AiAgentRootCause[]
    >(DEFAULT_VISIBLE_ROOT_CAUSES);
    const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
    const { data, isLoading } = useAiAgentAdminReviewItems({
        statuses: BOARD_STATUSES,
    });
    const { data: projects } = useProjects();
    const { user } = useApp();
    const currentUserUuid = user.data?.userUuid ?? null;
    const orgUsersByUuid = useOrgUsersByUuid();
    const [expandedLanes, setExpandedLanes] = useState<
        Partial<Record<ReviewLane, boolean>>
    >({});
    const [activeId, setActiveId] = useState<string | null>(null);
    // While a drag is in flight we hold the optimistic per-lane order here so
    // dragging can reorder freely. It's null the rest of the time — the board
    // then renders straight from server-derived `lanes` (kept current by the
    // reorder mutation's optimistic cache update), so no effect copies server
    // state into a parallel variable.
    const [dragLanes, setDragLanes] = useState<Record<
        ReviewLane,
        AiAgentReviewItemSummary[]
    > | null>(null);

    const queryClient = useQueryClient();
    const updateStatus = useUpdateAiAgentReviewItemStatus();
    const createWriteback = useCreateAiAgentReviewItemWriteback();
    const reorderItems = useReorderReviewItems();

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor),
    );

    const projectsMap = useMemo(() => {
        if (!projects) return new Map<string, { name: string }>();
        return new Map(projects.map((p) => [p.projectUuid, p]));
    }, [projects]);

    const allItems = useMemo<AiAgentReviewItemSummary[]>(() => {
        // Tie the examples to the tour being open (not to emptiness) so the same
        // cards get highlighted every run, even on a populated board.
        if (showOnboardingExamples) {
            return EXAMPLE_REVIEW_ITEMS;
        }
        return data ?? [];
    }, [data, showOnboardingExamples]);

    // Skeletons only on the genuine first load (keepPreviousData keeps refetches silent).
    const showSkeletons = isLoading && allItems.length === 0;

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
        let next = projectFilteredItems;
        if (selectedRootCauses.length > 0) {
            const rootCauseSet = new Set(selectedRootCauses);
            next = next.filter((item) =>
                rootCauseSet.has(item.primaryRootCause),
            );
        }
        if (selectedAssignees.length > 0) {
            next = next.filter((item) =>
                matchesAssigneeFilter(item, selectedAssignees),
            );
        }
        return next;
    }, [projectFilteredItems, selectedRootCauses, selectedAssignees]);

    const projectFacetOptions = useMemo((): FilterFacetOption[] => {
        const counts = new Map<string, number>();
        for (const item of searchFilteredItems.filter((item) => {
            // Exclude done items (resolved, dismissed, duplicate) so the badge
            // reflects only open work in each project.
            if (getReviewLane(item) === 'done') return false;
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

    const assigneeFacetOptions = useMemo(
        (): FilterFacetOption[] =>
            buildAssigneeFacetOptions({
                items: projectFilteredItems,
                usersByUuid: orgUsersByUuid,
                currentUserUuid,
            }),
        [projectFilteredItems, orgUsersByUuid, currentUserUuid],
    );

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

    // During a drag, render the optimistic order; otherwise straight from the
    // server (the reorder mutation updates the cache optimistically, so `lanes`
    // already reflects a just-dropped order without a reconcile effect).
    const displayLanes = dragLanes ?? lanes;

    const laneOf = (
        state: Record<ReviewLane, AiAgentReviewItemSummary[]>,
        id: string,
    ): ReviewLane | null => {
        if (LANE_IDS.has(id)) return id as ReviewLane;
        return (
            REVIEW_LANES.find((lane) =>
                state[lane.id].some((item) => item.uuid === id),
            )?.id ?? null
        );
    };

    const draggingItem = activeId
        ? (Object.values(displayLanes)
              .flat()
              .find((item) => item.uuid === activeId) ?? null)
        : null;

    const handleDragStart = ({ active }: DragStartEvent) => {
        setDragLanes(lanes);
        setActiveId(String(active.id));
    };

    // Reorder continuously while dragging — within a lane and across lanes — so
    // the card already sits in its final slot on release. Without this, dnd-kit
    // animates the drop back to the original index and the row flashes before
    // the persisted order lands. Lanes are resolved from `prev` to dodge stale
    // state across rapid dragOver events.
    const handleDragOver = ({ active, over }: DragOverEvent) => {
        if (!over) return;
        const activeKey = String(active.id);
        const overKey = String(over.id);
        if (activeKey === overKey) return;
        setDragLanes((prev) => {
            if (!prev) return prev;
            const fromLane = laneOf(prev, activeKey);
            const toLane = laneOf(prev, overKey);
            if (!fromLane || !toLane) return prev;
            const fromList = prev[fromLane];
            const activeIndex = fromList.findIndex(
                (item) => item.uuid === activeKey,
            );
            if (activeIndex < 0) return prev;

            if (fromLane === toLane) {
                const overIndex = fromList.findIndex(
                    (item) => item.uuid === overKey,
                );
                if (overIndex < 0 || activeIndex === overIndex) return prev;
                return {
                    ...prev,
                    [fromLane]: arrayMove(fromList, activeIndex, overIndex),
                };
            }

            const moved = fromList[activeIndex];
            const toList = prev[toLane];
            const overIndex = toList.findIndex((item) => item.uuid === overKey);
            const insertAt = overIndex >= 0 ? overIndex : toList.length;
            return {
                ...prev,
                [fromLane]: fromList.filter((item) => item.uuid !== activeKey),
                [toLane]: [
                    ...toList.slice(0, insertAt),
                    moved,
                    ...toList.slice(insertAt),
                ],
            };
        });
    };

    // dragOver has already placed the card in its final slot/lane; here we just
    // persist that order and apply the status change if it crossed lanes.
    const handleDragEnd = ({ active }: DragEndEvent) => {
        const activeKey = String(active.id);
        const snapshot = dragLanes;
        const clearDrag = () => {
            setActiveId(null);
            setDragLanes(null);
        };
        if (!snapshot) {
            clearDrag();
            return;
        }

        const lane = laneOf(snapshot, activeKey);
        const moved = lane
            ? snapshot[lane].find((item) => item.uuid === activeKey)
            : undefined;
        if (!lane || !moved) {
            clearDrag();
            return;
        }
        const laneList = snapshot[lane];
        const orderedFingerprints = laneList.map((item) => item.fingerprint);

        // Status follows the lane (null on lanes that don't map to a status).
        const targetStatus = LANE_TARGET_STATUS[lane];
        const statusOverride =
            targetStatus !== null && moved.status !== targetStatus
                ? { fingerprint: moved.fingerprint, status: targetStatus }
                : null;

        // Commit the dropped arrangement (order + cross-lane status) to the cache
        // and clear the transient drag order in the same tick, so the board hands
        // off to the server-derived lanes in one render — no flash to the old
        // position before the persist settles.
        applyOptimisticReviewBoardOrder(
            queryClient,
            orderedFingerprints,
            statusOverride,
        );
        clearDrag();

        if (statusOverride) {
            updateStatus.mutate({
                fingerprint: moved.fingerprint,
                body: { status: statusOverride.status, dismissedReason: null },
            });
            // The deterministic writeback kicks off when a card lands in
            // In progress, same as before.
            if (lane === 'in_progress') {
                const kind = getStartWritebackKind(moved);
                if (kind === 'mutate')
                    createWriteback.mutate(moved.fingerprint);
            }
        }

        // Persist the dropped lane's order (reindexes board_position). The source
        // lane keeps its relative order, so only this lane needs rewriting.
        reorderItems.mutate(orderedFingerprints);
    };

    const handleDragCancel = () => {
        setActiveId(null);
        setDragLanes(null);
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
                <FilterFacet
                    label="Assignee"
                    icon={IconUser}
                    options={assigneeFacetOptions}
                    selected={selectedAssignees}
                    onChange={setSelectedAssignees}
                    emptyLabel="No assignees in current view"
                    tooltipLabel="Filter by assignee"
                />
            </Group>
            <Box className={styles.boardWrapper}>
                <DndContext
                    sensors={sensors}
                    collisionDetection={collisionDetectionStrategy}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDragEnd={handleDragEnd}
                    onDragCancel={handleDragCancel}
                >
                    <Box className={styles.board}>
                        {REVIEW_LANES.map((lane, laneIndex) => {
                            const all = displayLanes[lane.id];
                            const isExpanded = expandedLanes[lane.id] ?? false;
                            const displayed =
                                isExpanded || all.length <= VISIBLE_PER_LANE
                                    ? all
                                    : all.slice(0, VISIBLE_PER_LANE);
                            const hasMore = all.length > VISIBLE_PER_LANE;

                            return (
                                <Box
                                    key={lane.id}
                                    className={styles.lane}
                                    data-tour={
                                        lane.id === 'in_progress'
                                            ? 'reviews-in-progress'
                                            : undefined
                                    }
                                >
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
                                        isDragActive={activeId !== null}
                                    >
                                        {showSkeletons ? (
                                            Array.from({
                                                length:
                                                    SKELETON_COUNTS[
                                                        laneIndex
                                                    ] ?? 2,
                                            }).map((_, i) => (
                                                <ReviewKanbanCardSkeleton
                                                    key={i}
                                                />
                                            ))
                                        ) : (
                                            <SortableContext
                                                items={displayed.map(
                                                    (item) => item.uuid,
                                                )}
                                                strategy={
                                                    verticalListSortingStrategy
                                                }
                                            >
                                                {displayed.length === 0 ? (
                                                    <Box
                                                        className={
                                                            styles.emptyLane
                                                        }
                                                    >
                                                        <Text
                                                            fz="xs"
                                                            c="dimmed"
                                                        >
                                                            No issues
                                                        </Text>
                                                    </Box>
                                                ) : (
                                                    displayed.map((item) => {
                                                        const target =
                                                            toTarget(item);
                                                        return (
                                                            <SortableCard
                                                                key={item.uuid}
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
                                                        );
                                                    })
                                                )}
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
                                            </SortableContext>
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
