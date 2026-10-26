import {
    closestCenter,
    DndContext,
    DragOverlay,
    KeyboardSensor,
    PointerSensor,
    pointerWithin,
    useDroppable,
    useSensor,
    useSensors,
    type CollisionDetection,
    type DragEndEvent,
    type DragStartEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import {
    getDashboardFilterField,
    interpolateUiString,
    type DashboardControlSection,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import { Box, Group, Text, UnstyledButton } from '@mantine/core';
import {
    IconChevronDown,
    IconChevronRight,
    IconFilter,
} from '@tabler/icons-react';
import { useCallback, useId, useState, type FC, type ReactNode } from 'react';
import FieldIcon from '../../components/common/Filters/FieldIcon';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    selectControlSections,
    selectDashboardFilters,
    selectSavedFilterOverrides,
    useDashboardSelector,
} from '../dashboard/store';
import {
    isFilterHiddenOnTab,
    useFilterTabPlacement,
} from '../dashboardFilters/ActiveFilters/useFilterTabPlacement';
import { AddControl } from './AddControl';
import { formatSectionCount } from './fieldLabels';
import { FilterPills } from './FilterPills';
import classes from './SectionedFilters.module.css';
import {
    getDragAnnouncements,
    groupRulesBySection,
    isRuleInSection,
    moveRuleToSection,
    UNSECTIONED_TARGET_ID,
    type SectionRule,
} from './sections';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { type PillPopoverState } from './ViewerSavedPills';

// The target is what is under the pointer; the keyboard sensor has none,
// so it falls back to the nearest centre
const underPointer: CollisionDetection = (args) => {
    const within = pointerWithin(args);
    return within.length > 0 ? within : closestCenter(args);
};

type CapsuleProps = {
    section: DashboardControlSection;
    /** Every member, on any tab */
    rules: SectionRule[];
    /** Members shown on the tab in view */
    visibleRules: DashboardFilterRule[];
    /** Whether a member differs from its default, as the bar's reset counts it */
    isChanged: (rule: DashboardFilterRule) => boolean;
    isOpen: boolean;
    onToggle: () => void;
    activeTabUuid: string | undefined;
    popover: PillPopoverState;
};

/** A section with more members than this (on any tab) starts collapsed */
const COLLAPSED_BY_DEFAULT_ABOVE = 6;

const SectionCapsule: FC<CapsuleProps> = ({
    section,
    rules,
    visibleRules,
    isChanged,
    isOpen,
    onToggle,
    activeTabUuid,
    popover,
}) => {
    const getUiString = useUiStrings();
    const summaryId = useId();
    const changedCount = visibleRules.filter(isChanged).length;
    // A drop anywhere on the outline joins the section; its own pills light nothing
    const { setNodeRef, isOver, active } = useDroppable({ id: section.id });
    const isForeignOver =
        isOver && !rules.some(({ rule }) => rule.id === active?.id);
    // The capsule makes room: a slot the dragged pill's size at its end
    const slotRect = active?.rect.current.initial;
    // Nothing to show on this tab (an editor's bar only): the member count
    const hasVisible = visibleRules.length > 0;
    return (
        <Box
            ref={setNodeRef}
            className={classes.capsule}
            data-collapsed={!(isOpen && hasVisible) || undefined}
            data-over={isForeignOver || undefined}
        >
            <UnstyledButton
                className={`${classes.toggle} mantine-focus-auto`}
                aria-expanded={isOpen}
                aria-describedby={isOpen && hasVisible ? undefined : summaryId}
                onClick={onToggle}
            >
                <MantineIcon
                    icon={isOpen ? IconChevronDown : IconChevronRight}
                    size={14}
                    color="dimmed"
                />
                <Text span fz="sm" fw={600}>
                    {section.name}
                </Text>
            </UnstyledButton>
            {/* Mounted on expand, so its pills arrive; `contents` keeps them
                in the capsule's own flow */}
            {!hasVisible ? (
                <Text span id={summaryId} fz="sm" c="dimmed">
                    {formatSectionCount(getUiString, rules.length)}
                </Text>
            ) : isOpen ? (
                <Box display="contents" className={classes.pillsEnter}>
                    <FilterPills
                        activeTabUuid={activeTabUuid}
                        sectionId={section.id}
                        popover={popover}
                    />
                </Box>
            ) : (
                <Text span id={summaryId} fz="sm" c="dimmed">
                    {changedCount > 0
                        ? interpolateUiString(
                              getUiString('filters.sectionChanged'),
                              { changed: changedCount },
                          )
                        : formatSectionCount(getUiString, visibleRules.length)}
                </Text>
            )}
            {isForeignOver && (
                <Box
                    className={classes.slot}
                    style={{
                        width: slotRect?.width ?? 120,
                        height: slotRect?.height ?? 28,
                    }}
                />
            )}
        </Box>
    );
};

// The bar's first button takes a pill out of its section
const UnsectionTarget: FC<{ children: ReactNode }> = ({ children }) => {
    const { setNodeRef, isOver } = useDroppable({ id: UNSECTIONED_TARGET_ID });
    return (
        <Box
            ref={setNodeRef}
            className={classes.unsectionTarget}
            data-over={isOver || undefined}
        >
            {children}
        </Box>
    );
};

type Props = {
    activeTabUuid: string | undefined;
    /** Rendered last in the flow: the edit bar's requirements button. */
    children?: ReactNode;
};

// The filter area of a dashboard with sections: Add, then one outlined
// capsule per section with a member on this tab (its toggle, then its pills
// inline), then the unsectioned pass (the unsectioned saved pills, the
// viewer's own). Collapsing is local state keyed by section id, as the
// ids whose state differs from their default; one saved popover is open across
// every pass. In edit mode one drag context spans the passes: a pill dropped
// on a pill takes its place and section, on a capsule joins that section
// last, on the first button leaves its section
export const SectionedFilters: FC<Props> = ({ activeTabUuid, children }) => {
    const [flippedIds, setFlippedIds] = useState<Set<string>>(() => new Set());
    const [openPopoverId, setOpenPopoverId] = useState<string>();
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const onPopoverClose = useCallback(() => setOpenPopoverId(undefined), []);
    const getUiString = useUiStrings();
    const isViewer = useControlsSidebarSelector((c) => c.isViewer);
    const sections = useDashboardSelector(selectControlSections);
    const dashboardFilters = useDashboardSelector(selectDashboardFilters);
    const overrides = useDashboardSelector(selectSavedFilterOverrides);
    // A viewer's saved pill is changed once Apply wrote it as an override; an
    // editor's values are the defaults, so nothing of theirs counts
    const isChanged = (rule: DashboardFilterRule) =>
        isViewer &&
        [...overrides.dimensions, ...overrides.metrics].some(
            (override) => override.id === rule.id,
        );
    const isLoading = useDashboardContext(
        (c) => c.isLoadingDashboardFilters || c.isFetchingDashboardFilters,
    );
    const setDashboardFilters = useDashboardContext(
        (c) => c.setDashboardFilters,
    );
    const setHaveFiltersChanged = useDashboardContext(
        (c) => c.setHaveFiltersChanged,
    );
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );
    const allFilterableMetricsMap = useDashboardContext(
        (c) => c.allFilterableMetricsMap,
    );
    const { getTabsUsingFilter } = useFilterTabPlacement();
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );

    const toggle = (id: string) =>
        setFlippedIds((previous) => {
            const next = new Set(previous);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    // No groups while loading: the unsectioned pass shows the skeletons. A
    // viewer sees only the sections with a member on this tab; an editor
    // every section, so each is a drop target
    const groups = isLoading
        ? []
        : groupRulesBySection(dashboardFilters, sections).flatMap(
              ({ section, rules }) => {
                  if (section === null) return [];
                  const visibleRules = rules
                      .map(({ rule }) => rule)
                      .filter(
                          (rule) =>
                              !isFilterHiddenOnTab(
                                  getTabsUsingFilter(rule),
                                  activeTabUuid,
                              ),
                      );
                  return visibleRules.length === 0 && isViewer
                      ? []
                      : [{ section, rules, visibleRules }];
              },
          );
    const isOpen = (section: DashboardControlSection, total: number) =>
        !(total > COLLAPSED_BY_DEFAULT_ABOVE) !== flippedIds.has(section.id);
    // A popover in a collapsed or hidden section is closed with it
    const sectionOfOpenPopover = groupRulesBySection(
        dashboardFilters,
        sections,
    ).find(({ rules }) => rules.some(({ rule }) => rule.id === openPopoverId));
    const isPopoverShown =
        openPopoverId === undefined ||
        sectionOfOpenPopover === undefined ||
        sectionOfOpenPopover.section === null ||
        groups.some(
            ({ section, rules }) =>
                section.id === sectionOfOpenPopover.section?.id &&
                isOpen(section, rules.length),
        );
    const popover: PillPopoverState = {
        openPopoverId: isPopoverShown ? openPopoverId : undefined,
        onPopoverOpen: setOpenPopoverId,
        onPopoverClose,
    };

    const capsules = groups.map(({ section, rules, visibleRules }) => (
        <SectionCapsule
            key={section.id}
            section={section}
            rules={rules}
            visibleRules={visibleRules}
            isChanged={isChanged}
            isOpen={isOpen(section, rules.length)}
            onToggle={() => toggle(section.id)}
            activeTabUuid={activeTabUuid}
            popover={popover}
        />
    ));
    const pills = (
        <FilterPills
            activeTabUuid={activeTabUuid}
            sectionId={null}
            popover={popover}
        />
    );

    if (isViewer) {
        return (
            <Box className={classes.flow}>
                <AddControl />
                {capsules}
                {pills}
                {children}
            </Box>
        );
    }

    const allRules = groupRulesBySection(dashboardFilters, sections).flatMap(
        ({ rules }) => rules,
    );
    const fieldOf = ({ rule, group }: SectionRule) =>
        getDashboardFilterField<DashboardFilterableField>(
            group === 'metrics'
                ? allFilterableMetricsMap
                : allFilterableFieldsMap,
            rule,
            filterableFieldsByTileUuid,
        ) ?? null;
    const nameOf = (id: string) => {
        if (id === UNSECTIONED_TARGET_ID)
            return 'the space outside any section';
        const section = sections.find((s) => s.id === id);
        if (section)
            return `section ${section.name || getUiString('filters.rail.untitledSection')}`;
        const found = allRules.find(({ rule }) => rule.id === id);
        return found
            ? found.rule.label ||
                  fieldOf(found)?.label ||
                  found.rule.target.fieldId
            : 'a filter';
    };
    const handleDragEnd = ({ active, over }: DragEndEvent) => {
        setDraggedId(null);
        if (!over || active.id === over.id) return;
        const activeId = String(active.id);
        const overId = String(over.id);
        const activeRule = allRules.find(({ rule }) => rule.id === activeId);
        if (!activeRule) return;
        const currentSectionId = isRuleInSection(
            activeRule.rule,
            null,
            sections,
        )
            ? null
            : (activeRule.rule.sectionId ?? null);
        const target =
            overId === UNSECTIONED_TARGET_ID
                ? { sectionId: null }
                : sections.some((s) => s.id === overId)
                  ? { sectionId: overId }
                  : { ruleId: overId };
        if ('sectionId' in target && target.sectionId === currentSectionId)
            return;
        const moved = moveRuleToSection(dashboardFilters, activeId, target);
        if (moved === dashboardFilters) return;
        setDashboardFilters(moved);
        setHaveFiltersChanged(true);
    };
    const dragged = allRules.find(({ rule }) => rule.id === draggedId);
    const draggedField = dragged ? fieldOf(dragged) : null;

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={underPointer}
            accessibility={{ announcements: getDragAnnouncements(nameOf) }}
            onDragStart={({ active }: DragStartEvent) =>
                setDraggedId(String(active.id))
            }
            onDragEnd={handleDragEnd}
            onDragCancel={() => setDraggedId(null)}
        >
            <Box className={classes.flow}>
                <UnsectionTarget>
                    <AddControl />
                </UnsectionTarget>
                {capsules}
                {pills}
                {children}
            </Box>
            <DragOverlay>
                {dragged && (
                    <Group
                        gap={6}
                        wrap="nowrap"
                        className={classes.dragPreview}
                    >
                        {draggedField ? (
                            <FieldIcon item={draggedField} size={14} />
                        ) : (
                            <MantineIcon icon={IconFilter} size={14} />
                        )}
                        <Text fz="xs" fw={500} truncate>
                            {nameOf(dragged.rule.id)}
                        </Text>
                    </Group>
                )}
            </DragOverlay>
        </DndContext>
    );
};
