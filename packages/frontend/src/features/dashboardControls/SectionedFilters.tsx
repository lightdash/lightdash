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
import {
    ActionIcon,
    Box,
    Button,
    Group,
    Text,
    UnstyledButton,
} from '@mantine/core';
import {
    IconChevronDown,
    IconChevronRight,
    IconFilter,
    IconPlus,
} from '@tabler/icons-react';
import {
    useCallback,
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
    type FC,
    type ReactNode,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import FieldIcon from '../../components/common/Filters/FieldIcon';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    dashboardEditActions,
    selectControlSections,
    selectDashboardFilters,
    selectSavedFilterOverrides,
    useDashboardDispatch,
    useDashboardSelector,
} from '../dashboard/store';
import {
    isFilterHiddenOnTab,
    useFilterTabPlacement,
} from '../dashboardFilters/ActiveFilters/useFilterTabPlacement';
import { AddControl } from './AddControl';
import { BarSelectionContext, type BarSelection } from './barSelection';
import { formatSectionCount } from './fieldLabels';
import { FilterPills } from './FilterPills';
import classes from './SectionedFilters.module.css';
import { SectionMenu, SectionNameInput } from './SectionHeader';
import {
    getDragAnnouncements,
    groupRulesBySection,
    isRuleInSection,
    moveRuleToSection,
    moveRulesToSection,
    rangeBetween,
    UNSECTIONED_TARGET_ID,
    type SectionRule,
    isCollapsedByDefault,
    removeSectionFromRules,
} from './sections';
import { SelectionBar } from './SelectionBar';
import { removeFilterRule } from './sidebarState';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { hasOpenLayer } from './useEditorDismiss';
import { type PillPopoverState } from './ViewerSavedPills';

// The target is what is under the pointer; the keyboard sensor has none,
// so it falls back to the nearest centre
const underPointer: CollisionDetection = (args) => {
    const within = pointerWithin(args);
    return within.length > 0 ? within : closestCenter(args);
};

// Focus goes back to `ref` once an input unmounts with focus (Enter or
// Escape), never away from what a blur clicked
const useRefocusAfter = (isEditing: boolean) => {
    const ref = useRef<HTMLButtonElement>(null);
    const wasEditing = useRef(isEditing);
    useEffect(() => {
        if (
            wasEditing.current &&
            !isEditing &&
            (document.activeElement === null ||
                document.activeElement === document.body)
        )
            ref.current?.focus();
        wasEditing.current = isEditing;
    }, [isEditing]);
    return ref;
};

const nameInputClassNames = {
    root: classes.nameInput,
    input: classes.nameInputField,
};

/** An editor's capsule controls; a viewer's capsule has none. */
type CapsuleActions = {
    onRename: (name: string) => void;
    onAddFilter: () => void;
    onToggleCollapsedByDefault: () => void;
    onRemove: () => void;
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
    actions: CapsuleActions | null;
};

const SectionCapsule: FC<CapsuleProps> = ({
    section,
    rules,
    visibleRules,
    isChanged,
    isOpen,
    onToggle,
    activeTabUuid,
    popover,
    actions,
}) => {
    const getUiString = useUiStrings();
    const summaryId = useId();
    const [isRenaming, setIsRenaming] = useState(false);
    const nameRef = useRefocusAfter(isRenaming);
    const changedCount = visibleRules.filter(isChanged).length;
    // A drop anywhere on the outline joins the section: a line after its
    // last pill (`data-over`, a pseudo-element, so nothing changes size);
    // its own pills light nothing
    const { setNodeRef, isOver, active } = useDroppable({ id: section.id });
    const isForeignOver =
        isOver && !rules.some(({ rule }) => rule.id === active?.id);
    // Nothing to show on this tab (an editor's bar only): the member count
    const hasVisible = visibleRules.length > 0;
    return (
        <Box
            ref={setNodeRef}
            role="group"
            aria-label={section.name}
            className={classes.capsule}
            data-collapsed={!(isOpen && hasVisible) || undefined}
            data-editable={actions !== null || undefined}
            data-over={isForeignOver || undefined}
        >
            {actions === null ? (
                <UnstyledButton
                    className={`${classes.toggle} mantine-focus-auto`}
                    aria-expanded={isOpen}
                    aria-describedby={
                        isOpen && hasVisible ? undefined : summaryId
                    }
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
            ) : (
                <>
                    {/* An editor's chevron only folds; the name renames */}
                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="sm"
                        radius="xl"
                        aria-label={interpolateUiString(
                            getUiString(
                                isOpen
                                    ? 'filters.rail.collapseSection'
                                    : 'filters.rail.expandSection',
                            ),
                            { section: section.name },
                        )}
                        aria-expanded={isOpen}
                        aria-describedby={
                            isOpen && hasVisible ? undefined : summaryId
                        }
                        onClick={onToggle}
                    >
                        <MantineIcon
                            icon={isOpen ? IconChevronDown : IconChevronRight}
                            size={14}
                            color="dimmed"
                        />
                    </ActionIcon>
                    {isRenaming ? (
                        <SectionNameInput
                            name={section.name}
                            onCommit={(name) => {
                                setIsRenaming(false);
                                if (name !== section.name)
                                    actions.onRename(name);
                            }}
                            onCancel={() => setIsRenaming(false)}
                            classNames={nameInputClassNames}
                        />
                    ) : (
                        <UnstyledButton
                            ref={nameRef}
                            className={`${classes.name} mantine-focus-auto`}
                            onClick={() => setIsRenaming(true)}
                        >
                            <Text span fz="sm" fw={600}>
                                {section.name}
                            </Text>
                        </UnstyledButton>
                    )}
                </>
            )}
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
            {actions !== null && (
                <Group gap={2} wrap="nowrap" className={classes.actions}>
                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="sm"
                        radius="xl"
                        aria-label={`Add filter to ${section.name}`}
                        onClick={actions.onAddFilter}
                    >
                        <MantineIcon icon={IconPlus} size={14} />
                    </ActionIcon>
                    <SectionMenu
                        label={`${section.name} menu`}
                        countLabel={formatSectionCount(
                            getUiString,
                            rules.length,
                        )}
                        isCollapsedByDefault={isCollapsedByDefault(
                            section,
                            rules.length,
                        )}
                        onToggleCollapsedByDefault={
                            actions.onToggleCollapsedByDefault
                        }
                        onRemove={actions.onRemove}
                    />
                </Group>
            )}
        </Box>
    );
};

// "Add section" and, while naming, a new capsule naming the section in place
const AddSection: FC<{
    isNaming: boolean;
    onStart: () => void;
    onAdd: (name: string) => void;
    onCancel: () => void;
}> = ({ isNaming, onStart, onAdd, onCancel }) => {
    const addRef = useRefocusAfter(isNaming);
    return isNaming ? (
        <Box className={classes.capsule} data-collapsed data-editable>
            <SectionNameInput
                name=""
                onCommit={onAdd}
                onCancel={onCancel}
                classNames={nameInputClassNames}
            />
        </Box>
    ) : (
        <Button
            ref={addRef}
            size="xs"
            variant="default"
            radius={100}
            className={classes.addSection}
            onClick={onStart}
        >
            Add section
        </Button>
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
    // An editor's picked pills, and the pill picked last (a range's start)
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const lastPickedId = useRef<string | null>(null);
    // A section being named on the bar, with the pills it takes on commit
    const [naming, setNaming] = useState<{ moveIds: string[] } | null>(null);
    const onPopoverClose = useCallback(() => setOpenPopoverId(undefined), []);
    const getUiString = useUiStrings();
    const isViewer = useControlsSidebarSelector((c) => c.isViewer);
    const openNew = useControlsSidebarSelector((c) => c.openNew);
    const dispatch = useDashboardDispatch();
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
        !isCollapsedByDefault(section, total) !== flippedIds.has(section.id);
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
    // The pills on screen in bar order: each open capsule's, then the
    // unsectioned ones; a folded capsule's are left out
    const barOrderKey = [
        ...groups.flatMap(({ section, rules, visibleRules }) =>
            isOpen(section, rules.length) ? visibleRules : [],
        ),
        ...groupRulesBySection(dashboardFilters, sections)
            .filter(({ section }) => section === null)
            .flatMap(({ rules }) => rules.map(({ rule }) => rule))
            .filter(
                (rule) =>
                    !isFilterHiddenOnTab(
                        getTabsUsingFilter(rule),
                        activeTabUuid,
                    ),
            ),
    ]
        .map((rule) => rule.id)
        .join('\n');
    const clearSelection = useCallback(() => {
        lastPickedId.current = null;
        setSelectedIds([]);
    }, []);
    const selection = useMemo<BarSelection>(
        () => ({
            selectedIds,
            pick: (id, isRange) => {
                const range = isRange
                    ? rangeBetween(
                          barOrderKey.split('\n'),
                          lastPickedId.current,
                          id,
                      )
                    : null;
                lastPickedId.current = id;
                setSelectedIds((current) =>
                    range !== null
                        ? [
                              ...current,
                              ...range.filter((r) => !current.includes(r)),
                          ]
                        : current.includes(id)
                          ? current.filter((r) => r !== id)
                          : [...current, id],
                );
            },
            clear: clearSelection,
        }),
        [selectedIds, barOrderKey, clearSelection],
    );
    // Escape clears the selection, unless something open or focused owns it
    const hasSelection = selectedIds.length > 0;
    useEffect(() => {
        if (!hasSelection) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape' || event.defaultPrevented) return;
            if (
                event.target instanceof Element &&
                event.target.closest('[data-own-escape]')
            )
                return;
            if (hasOpenLayer()) return;
            clearSelection();
        };
        // Capture: an open menu is still open when this runs
        document.addEventListener('keydown', handleKeyDown, true);
        return () =>
            document.removeEventListener('keydown', handleKeyDown, true);
    }, [hasSelection, clearSelection]);

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
            actions={
                isViewer
                    ? null
                    : {
                          onRename: (name) =>
                              dispatch(
                                  dashboardEditActions.renameControlSection({
                                      ...section,
                                      name,
                                  }),
                              ),
                          onAddFilter: () => openNew(section.id),
                          // Saved either way, so unticked means open
                          onToggleCollapsedByDefault: () =>
                              dispatch(
                                  dashboardEditActions.setControlSectionCollapsed(
                                      {
                                          id: section.id,
                                          collapsed: !isCollapsedByDefault(
                                              section,
                                              rules.length,
                                          ),
                                      },
                                  ),
                              ),
                          onRemove: () => {
                              dispatch(
                                  dashboardEditActions.removeControlSection(
                                      section.id,
                                  ),
                              );
                              if (rules.length === 0) return;
                              setDashboardFilters((filters) =>
                                  removeSectionFromRules(filters, section.id),
                              );
                              setHaveFiltersChanged(true);
                          },
                      }
            }
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
    // Picked, in display order, and only what is still a filter
    const selected = allRules
        .map(({ rule }) => rule.id)
        .filter((id) => selectedIds.includes(id));
    const sectionOfRule = (rule: DashboardFilterRule) =>
        isRuleInSection(rule, null, sections) ? null : (rule.sectionId ?? null);
    const moveSelected = (sectionId: string | null) => {
        const moved = moveRulesToSection(
            dashboardFilters,
            selected,
            sectionId,
            sections,
        );
        clearSelection();
        if (moved === dashboardFilters) return;
        setDashboardFilters(moved);
        setHaveFiltersChanged(true);
    };
    const removeSelected = () => {
        setDashboardFilters((filters) =>
            selected.reduce(removeFilterRule, filters),
        );
        setHaveFiltersChanged(true);
        clearSelection();
    };
    const isSelectionDragged =
        draggedId !== null &&
        selected.length > 1 &&
        selected.includes(draggedId);
    const handleDragEnd = ({ active, over }: DragEndEvent) => {
        setDraggedId(null);
        const activeId = String(active.id);
        // A picked pill carries the selection: all of them join the target's section
        if (over && selected.length > 1 && selected.includes(activeId)) {
            const overId = String(over.id);
            const overRule = allRules.find(({ rule }) => rule.id === overId);
            moveSelected(
                overId === UNSECTIONED_TARGET_ID
                    ? null
                    : overRule
                      ? sectionOfRule(overRule.rule)
                      : overId,
            );
            return;
        }
        if (!over || active.id === over.id) return;
        const overId = String(over.id);
        const activeRule = allRules.find(({ rule }) => rule.id === activeId);
        if (!activeRule) return;
        const currentSectionId = sectionOfRule(activeRule.rule);
        const target =
            overId === UNSECTIONED_TARGET_ID
                ? { sectionId: null }
                : sections.some((s) => s.id === overId)
                  ? { sectionId: overId }
                  : { ruleId: overId };
        if ('sectionId' in target && target.sectionId === currentSectionId)
            return;
        const moved = moveRuleToSection(
            dashboardFilters,
            activeId,
            target,
            sections,
        );
        if (moved === dashboardFilters) return;
        if (selected.includes(activeId)) clearSelection();
        setDashboardFilters(moved);
        setHaveFiltersChanged(true);
    };
    const dragged = allRules.find(({ rule }) => rule.id === draggedId);
    const draggedField = dragged ? fieldOf(dragged) : null;

    return (
        <BarSelectionContext.Provider value={selection}>
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
                    <AddSection
                        isNaming={naming !== null}
                        onStart={() => setNaming({ moveIds: [] })}
                        onAdd={(name) => {
                            const id = uuidv4();
                            dispatch(
                                dashboardEditActions.addControlSection({
                                    id,
                                    name,
                                }),
                            );
                            if (naming !== null && naming.moveIds.length > 0) {
                                const moved = moveRulesToSection(
                                    dashboardFilters,
                                    naming.moveIds,
                                    id,
                                    sections,
                                );
                                setDashboardFilters(moved);
                                setHaveFiltersChanged(true);
                                clearSelection();
                            }
                            setNaming(null);
                        }}
                        // A cancelled name moves nothing and keeps the selection
                        onCancel={() => setNaming(null)}
                    />
                    {pills}
                    {children}
                </Box>
                <DragOverlay>
                    {isSelectionDragged ? (
                        <Group
                            gap={6}
                            wrap="nowrap"
                            className={classes.dragPreview}
                        >
                            <MantineIcon icon={IconFilter} size={14} />
                            <Text fz="xs" fw={500}>
                                {selected.length} filters
                            </Text>
                        </Group>
                    ) : (
                        dragged && (
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
                        )
                    )}
                </DragOverlay>
                {selected.length > 0 && (
                    <SelectionBar
                        count={selected.length}
                        sections={groupRulesBySection(
                            dashboardFilters,
                            sections,
                        ).flatMap(({ section, rules }) =>
                            section === null
                                ? []
                                : [{ ...section, count: rules.length }],
                        )}
                        onMove={moveSelected}
                        onMoveToNewSection={() =>
                            setNaming({ moveIds: selected })
                        }
                        onRemove={removeSelected}
                        onClear={clearSelection}
                    />
                )}
            </DndContext>
        </BarSelectionContext.Provider>
    );
};
