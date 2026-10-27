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
    Tooltip,
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
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { v4 as uuidv4 } from 'uuid';
import FieldIcon from '../../components/common/Filters/FieldIcon';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    type DashboardFiltersMovedMethod,
    type DashboardSectionCreatedSource,
} from '../../providers/Tracking/types';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
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
import { AddControl, InertWhileEditing } from './AddControl';
import { BarSelectionContext, type BarSelection } from './barSelection';
import { ChangedDot } from './ChangedDot';
import { formatSectionCount } from './fieldLabels';
import { FilterPills } from './FilterPills';
import pillClasses from './FilterPills.module.css';
import classes from './SectionedFilters.module.css';
import { SectionMenu } from './SectionMenu';
import { SectionNameInput, type NameExit } from './SectionNameInput';
import {
    BAR_SPACE_TARGET_ID,
    countFilters,
    countSectionChanges,
    getDragAnnouncements,
    groupRulesBySection,
    isRuleInSection,
    moveRuleToSection,
    moveRulesToSection,
    NEW_SECTION_TARGET_ID,
    rangeBetween,
    UNSECTIONED_TARGET_ID,
    type FilterGroup,
    type SectionRule,
    isCollapsedByDefault,
    removeSectionFromRules,
    SECTION_DRAG,
    underPointerFor,
} from './sections';
import { SelectionBar } from './SelectionBar';
import { removeFilterRule } from './sidebarState';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { hasOpenLayer } from './useEditorDismiss';
import { useSectionsTip } from './useSectionsTip';
import { type PillPopoverState } from './ViewerSavedPills';

const ADD_FILTER_SELECTOR =
    '[data-filter-actions] > button[data-dashboard-filter-control]';
const NEW_SECTION_SELECTOR = '[data-new-section]';
const pillSelector = (id: string) => `[data-controls-pill="${id}"]`;
const sectionNameSelector = (id: string) => `[data-section-name="${id}"]`;
const sectionAddSelector = (id: string) => `[data-section-add="${id}"]`;

// Moves focus once naming ended, unless a blur took it to another element
// (Tab, a click on a control); no ring after a pointer
const focusAfterNaming = (target: HTMLElement | null, exit: NameExit) => {
    if (exit === 'elsewhere') return;
    if (exit === 'pointer') target?.focus({ focusVisible: false });
    else target?.focus();
};

// Focus goes back to `ref` once the input unmounts (Enter, Escape, the
// check or X), never away from where a blur went
const useRefocusAfter = (isEditing: boolean) => {
    const ref = useRef<HTMLButtonElement>(null);
    const exit = useRef<NameExit>('keyboard');
    const wasEditing = useRef(isEditing);
    useEffect(() => {
        if (wasEditing.current && !isEditing)
            focusAfterNaming(ref.current, exit.current);
        wasEditing.current = isEditing;
    }, [isEditing]);
    return { ref, exit };
};

/** An editor's capsule controls; a viewer's capsule has none. */
type CapsuleActions = {
    /** A filter is edited: the name, + and menu are inert. */
    isLocked: boolean;
    /** Its name or saved fold differs from the saved dashboard. */
    isUnsaved: boolean;
    /** Alt with an arrow on the name: one place before (-1) or after (1). */
    onMove: (delta: -1 | 1) => void;
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
    /** The sections in bar order: which side a dragged capsule lands on. */
    sectionOrder: string[];
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
    sectionOrder,
}) => {
    const getUiString = useUiStrings();
    const summaryId = useId();
    const [isRenaming, setIsRenaming] = useState(false);
    const { ref: nameRef, exit: renameExit } = useRefocusAfter(isRenaming);
    const changedCount = visibleRules.filter(isChanged).length;
    // A drop anywhere on the outline joins the section: a line after its
    // last pill (`data-over`, a pseudo-element, so nothing changes size);
    // its own pills light nothing
    const { setNodeRef, isOver, active } = useDroppable({
        id: section.id,
        data: { kind: SECTION_DRAG },
    });
    // An editor drags the capsule by its head to reorder the sections
    const head = useDraggable({
        id: section.id,
        data: { kind: SECTION_DRAG },
        disabled: actions === null || actions.isLocked || isRenaming,
    });
    const isSectionDrag = active?.data?.current?.kind === SECTION_DRAG;
    const isForeignOver =
        isOver &&
        !isSectionDrag &&
        !rules.some(({ rule }) => rule.id === active?.id);
    // Another capsule over this one: a line on the side it would land
    const sectionDropSide =
        isOver && isSectionDrag && active?.id !== section.id
            ? sectionOrder.indexOf(String(active?.id)) <
              sectionOrder.indexOf(section.id)
                ? 'after'
                : 'before'
            : undefined;
    const chevronLabel = interpolateUiString(
        getUiString(
            isOpen
                ? 'filters.rail.collapseSection'
                : 'filters.rail.expandSection',
        ),
        { section: section.name },
    );
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
            data-section-drop={sectionDropSide}
            data-dragging={head.isDragging || undefined}
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
                    <Text span fz="xs" fw={600}>
                        {section.name}
                    </Text>
                </UnstyledButton>
            ) : (
                // The head drags the capsule (a pointer only: the keys
                // stay the chevron's and the name's)
                <Group
                    ref={head.setNodeRef}
                    gap={0}
                    wrap="nowrap"
                    className={classes.head}
                    onPointerDown={(event) =>
                        head.listeners?.onPointerDown?.(event)
                    }
                >
                    {/* An editor's chevron only folds; the name renames */}
                    <Tooltip label={chevronLabel}>
                        <ActionIcon
                            size="sm"
                            radius="xl"
                            aria-label={chevronLabel}
                            aria-expanded={isOpen}
                            aria-describedby={
                                isOpen && hasVisible ? undefined : summaryId
                            }
                            onClick={onToggle}
                        >
                            <MantineIcon
                                icon={
                                    isOpen ? IconChevronDown : IconChevronRight
                                }
                                size={14}
                            />
                        </ActionIcon>
                    </Tooltip>
                    {isRenaming ? (
                        <SectionNameInput
                            name={section.name}
                            onCommit={(name, exit) => {
                                renameExit.current = exit;
                                setIsRenaming(false);
                                if (name !== section.name)
                                    actions.onRename(name);
                            }}
                            onCancel={(exit) => {
                                renameExit.current = exit;
                                setIsRenaming(false);
                            }}
                        />
                    ) : (
                        <Button
                            ref={nameRef}
                            size="xs"
                            variant="subtle"
                            color="gray"
                            radius="xl"
                            fz="xs"
                            fw={600}
                            className={classes.name}
                            data-section-name={section.id}
                            inert={actions.isLocked || undefined}
                            onClick={() => setIsRenaming(true)}
                            onKeyDown={(event) => {
                                if (
                                    !event.altKey ||
                                    (event.key !== 'ArrowLeft' &&
                                        event.key !== 'ArrowRight')
                                )
                                    return;
                                event.preventDefault();
                                actions.onMove(
                                    event.key === 'ArrowLeft' ? -1 : 1,
                                );
                            }}
                        >
                            {section.name}
                        </Button>
                    )}
                </Group>
            )}
            {/* Mounted on expand, so its pills arrive; `contents` keeps them
                in the capsule's own flow */}
            {!hasVisible ? (
                <Text span id={summaryId} fz="xs" c="dimmed">
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
                <Text span id={summaryId} fz="xs" c="dimmed">
                    {changedCount > 0
                        ? interpolateUiString(
                              getUiString('filters.sectionChanged'),
                              { changed: changedCount },
                          )
                        : formatSectionCount(getUiString, visibleRules.length)}
                </Text>
            )}
            {actions?.isUnsaved && <ChangedDot />}
            {actions !== null && (
                <Group
                    gap={2}
                    wrap="nowrap"
                    className={`${classes.actions} ${pillClasses.inert}`}
                    inert={actions.isLocked || undefined}
                >
                    <Tooltip label={`Add filter to ${section.name}`}>
                        <ActionIcon
                            size="sm"
                            radius="xl"
                            aria-label={`Add filter to ${section.name}`}
                            data-section-add={section.id}
                            onClick={actions.onAddFilter}
                        >
                            <MantineIcon icon={IconPlus} size={14} />
                        </ActionIcon>
                    </Tooltip>
                    <SectionMenu
                        label={`${section.name} menu`}
                        hasMembers={rules.length > 0}
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

// A new section named in place, first, after "Add filter". A cancel hands
// focus to `cancelFocusSelector`; a commit leaves it to the bar
const NewSection: FC<{
    onAdd: (name: string, exit: NameExit) => void;
    onCancel: () => void;
    cancelFocusSelector: string;
}> = ({ onAdd, onCancel, cancelFocusSelector }) => {
    const cancelExit = useRef<NameExit | null>(null);
    useEffect(
        () => () => {
            if (cancelExit.current === null) return;
            focusAfterNaming(
                document.querySelector<HTMLElement>(cancelFocusSelector) ??
                    document.querySelector<HTMLElement>(ADD_FILTER_SELECTOR),
                cancelExit.current,
            );
        },
        [cancelFocusSelector],
    );
    return (
        <Box className={classes.capsule} data-collapsed data-editable>
            <SectionNameInput
                name=""
                onCommit={onAdd}
                onCancel={(exit) => {
                    cancelExit.current = exit;
                    onCancel();
                }}
            />
        </Box>
    );
};

// The bar's first button takes a pill out of its section
const UnsectionTarget: FC<{
    looseEnd: string | undefined;
    children: ReactNode;
}> = ({ looseEnd, children }) => {
    const { setNodeRef, isOver } = useDroppable({ id: UNSECTIONED_TARGET_ID });
    return (
        <Box
            ref={setNodeRef}
            className={classes.unsectionTarget}
            data-over={isOver || undefined}
            data-loose-end={looseEnd}
        >
            {children}
        </Box>
    );
};

// The bar's last item in edit mode: a dashed capsule that starts a section,
// on a click or with a pill dropped on it
const NewSectionGhost: FC<{ isDisabled: boolean; onClick: () => void }> = ({
    isDisabled,
    onClick,
}) => {
    const { setNodeRef, isOver } = useDroppable({
        id: NEW_SECTION_TARGET_ID,
        disabled: isDisabled,
    });
    return (
        <UnstyledButton
            ref={setNodeRef}
            className={`${classes.newSectionGhost} mantine-focus-auto`}
            data-new-section
            data-over={isOver || undefined}
            onClick={onClick}
        >
            <MantineIcon icon={IconPlus} size={14} />
            New section
        </UnstyledButton>
    );
};

// The bar's space outside every capsule and pill also takes a pill out of
// its section: `data-over` names the leaving pill's kind, and the line shows
// on the loose item it would land after (`data-loose-end`)
const BarSpace: FC<{
    leavingKindOf: (id: string) => FilterGroup | null;
    isSectioned: boolean;
    children: ReactNode;
}> = ({ leavingKindOf, isSectioned, children }) => {
    const { setNodeRef, isOver, active } = useDroppable({
        id: BAR_SPACE_TARGET_ID,
    });
    return (
        <Box
            ref={setNodeRef}
            className={classes.flow}
            data-sectioned={isSectioned || undefined}
            data-over={
                (isOver &&
                    active !== null &&
                    leavingKindOf(String(active.id))) ||
                undefined
            }
        >
            {children}
        </Box>
    );
};

type Props = {
    activeTabUuid: string | undefined;
};

const LOOSE_START = 'loose-start';

// The filter area of a dashboard with sections: Add, then the unsectioned
// pass (the unsectioned saved pills, the viewer's own), then one outlined
// capsule per section with a member on this tab (its toggle, then its pills
// inline), then an editor's entry (the New section capsule, or the new
// section's name). Collapsing is local state keyed by section id, as the
// ids whose state differs from their default; one saved popover is open across
// every pass. In edit mode one drag context spans the passes: a pill dropped
// on a pill takes its place and section, on a capsule joins that section
// last, on the first button or the bar's empty space leaves its section
export const SectionedFilters: FC<Props> = ({ activeTabUuid }) => {
    const [flippedIds, setFlippedIds] = useState<Set<string>>(() => new Set());
    const [openPopoverId, setOpenPopoverId] = useState<string>();
    const [draggedId, setDraggedId] = useState<string | null>(null);
    // An editor's picked pills, and the pill picked last (a range's start)
    const [picked, setPicked] = useState<{
        ids: string[];
        anchorId: string | null;
    }>({ ids: [], anchorId: null });
    const selectedIds = picked.ids;
    // A section being named on the bar, with the pills it takes on commit
    const [naming, setNaming] = useState<{
        moveIds: string[];
        source: DashboardSectionCreatedSource;
    } | null>(null);
    const onPopoverClose = useCallback(() => setOpenPopoverId(undefined), []);
    const getUiString = useUiStrings();
    const isViewer = useControlsSidebarSelector((c) => c.isViewer);
    const isEditing = useControlsSidebarSelector((c) => c.isSidebarOpen);
    const editingFilterId = useControlsSidebarSelector(
        (c) => c.editing?.filterId ?? null,
    );
    const moveEditedFilter = useControlsSidebarSelector(
        (c) => c.moveEditedFilter,
    );
    const openNew = useControlsSidebarSelector((c) => c.openNew);
    // Any edit, however it starts, ends the selection: adjusted in render
    const [wasEditing, setWasEditing] = useState(isEditing);
    if (isEditing !== wasEditing) {
        setWasEditing(isEditing);
        if (isEditing) setPicked({ ids: [], anchorId: null });
    }
    // Focus to hand over once the next render is on screen: the first of
    // these selectors that finds an element takes it
    const focusAfter = useRef<string[] | null>(null);
    useLayoutEffect(() => {
        if (focusAfter.current === null) return;
        const element = focusAfter.current
            .map((selector) => document.querySelector<HTMLElement>(selector))
            .find((candidate) => candidate !== null);
        focusAfter.current = null;
        element?.focus();
    });
    // A new section's + (its next step) takes focus once it is on screen,
    // unless the naming blurred to another element or moved pills (the
    // first moved pill has focus then)
    const focusNewSection = useRef<{ id: string; exit: NameExit } | null>(null);
    useLayoutEffect(() => {
        const pending = focusNewSection.current;
        if (pending === null) return;
        focusNewSection.current = null;
        const active = document.activeElement;
        if (active !== null && active !== document.body) return;
        focusAfterNaming(
            document.querySelector<HTMLElement>(
                sectionAddSelector(pending.id),
            ) ??
                document.querySelector<HTMLElement>(
                    sectionNameSelector(pending.id),
                ) ??
                document.querySelector<HTMLElement>(ADD_FILTER_SELECTOR),
            pending.exit,
        );
    });
    const dispatch = useDashboardDispatch();
    const { track } = useTracking();
    const dashboardUuid = useDashboardContext((c) => c.dashboard?.uuid);
    const { isShown: isTipShown } = useSectionsTip();
    const sections = useDashboardSelector(selectControlSections);
    const savedSections = useDashboardContext(
        (c) => c.dashboard?.config?.controlSections,
    );
    // What Save would keep: a new section, a rename or another way to start;
    // the fold is compared as the bar reads it, so no key and its default agree
    const isUnsaved = (section: DashboardControlSection, total: number) => {
        const saved = savedSections?.find(({ id }) => id === section.id);
        return (
            saved === undefined ||
            saved.name !== section.name ||
            isCollapsedByDefault(saved, total) !==
                isCollapsedByDefault(section, total)
        );
    };
    const dashboardFilters = useDashboardSelector(selectDashboardFilters);
    const eventBase = {
        dashboardUuid,
        filtersCount: countFilters(dashboardFilters),
    };
    const overrides = useDashboardSelector(selectSavedFilterOverrides);
    // A viewer's saved pill is changed once Apply wrote it as an override; an
    // editor's values are the defaults, so nothing of theirs counts
    const isChanged = (rule: DashboardFilterRule) =>
        isViewer &&
        [...overrides.dimensions, ...overrides.metrics].some(
            (override) => override.id === rule.id,
        );
    // The first load only: a refetch keeps the last fields, so the capsules stay
    const isLoading = useDashboardContext((c) => c.isLoadingDashboardFilters);
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

    // No groups on the first load: the unsectioned pass shows the skeletons. A
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
    // unsectioned ones; a folded capsule's are left out. Read when a pill is
    // picked, so the selection does not change with it
    const looseOnTab = groupRulesBySection(dashboardFilters, sections)
        .filter(({ section }) => section === null)
        .flatMap(({ rules }) => rules)
        .filter(
            ({ rule }) =>
                !isFilterHiddenOnTab(getTabsUsingFilter(rule), activeTabUuid),
        );
    // Where a pill leaving its section lands, by kind: after the last loose
    // pill of its kind; a metric with none after the last loose dimension;
    // else first, after "Add filter"
    const lastLooseOf = (group: FilterGroup) =>
        looseOnTab.filter((entry) => entry.group === group).at(-1)?.rule.id;
    const dimensionsEnd = lastLooseOf('dimensions') ?? LOOSE_START;
    const metricsEnd =
        lastLooseOf('metrics') ?? lastLooseOf('dimensions') ?? LOOSE_START;
    const looseEnds: Record<string, string> = {};
    looseEnds[dimensionsEnd] = 'dimensions';
    looseEnds[metricsEnd] = [looseEnds[metricsEnd], 'metrics']
        .filter(Boolean)
        .join(' ');
    const barOrder = [
        ...looseOnTab.map(({ rule }) => rule),
        ...groups.flatMap(({ section, rules, visibleRules }) =>
            isOpen(section, rules.length) ? visibleRules : [],
        ),
    ].map((rule) => rule.id);
    const latestBarOrder = useRef(barOrder);
    useLayoutEffect(() => {
        latestBarOrder.current = barOrder;
    });
    const clearSelection = useCallback(
        () => setPicked({ ids: [], anchorId: null }),
        [],
    );
    const selection = useMemo<BarSelection>(
        () => ({
            selectedIds,
            pick: (id, isRange) =>
                setPicked(({ ids, anchorId }) => {
                    const range = isRange
                        ? rangeBetween(latestBarOrder.current, anchorId, id)
                        : null;
                    return {
                        anchorId: id,
                        ids:
                            range !== null
                                ? [
                                      ...ids,
                                      ...range.filter((r) => !ids.includes(r)),
                                  ]
                                : ids.includes(id)
                                  ? ids.filter((r) => r !== id)
                                  : [...ids, id],
                    };
                }),
            clear: clearSelection,
        }),
        [selectedIds, clearSelection],
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

    const sectionOrder = sections.map(({ id }) => id);
    const moveSection = (id: string, overId: string | undefined) => {
        if (overId === undefined || overId === id) return;
        dispatch(dashboardEditActions.moveControlSection({ id, overId }));
    };
    const capsules = groups.map(({ section, rules, visibleRules }) => (
        <SectionCapsule
            key={section.id}
            section={section}
            rules={rules}
            visibleRules={visibleRules}
            isChanged={isChanged}
            isOpen={isOpen(section, rules.length)}
            onToggle={() => {
                // A viewer's fold only; an editor's is not tracked
                if (isViewer) {
                    track({
                        name: EventName.DASHBOARD_SECTION_TOGGLED,
                        properties: {
                            dashboardUuid,
                            filtersCount: rules.length,
                            expanded: !isOpen(section, rules.length),
                            collapsedByDefault: isCollapsedByDefault(
                                section,
                                rules.length,
                            ),
                        },
                    });
                }
                toggle(section.id);
            }}
            activeTabUuid={activeTabUuid}
            popover={popover}
            sectionOrder={sectionOrder}
            actions={
                isViewer
                    ? null
                    : {
                          isLocked: isEditing,
                          isUnsaved: isUnsaved(section, rules.length),
                          onMove: (delta) =>
                              moveSection(
                                  section.id,
                                  sectionOrder[
                                      sectionOrder.indexOf(section.id) + delta
                                  ],
                              ),
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
                              // The menu leaves with its capsule
                              focusAfter.current = [ADD_FILTER_SELECTOR];
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
            looseEnds={isViewer ? undefined : looseEnds}
        />
    );

    // Named last, in the entry's place at the bar's end, wherever it was
    // started, so nothing before it moves
    const newSection = naming !== null && (
        <NewSection
            onAdd={(name, exit) => {
                const section = { id: uuidv4(), name };
                focusNewSection.current = { id: section.id, exit };
                dispatch(dashboardEditActions.addControlSection(section));
                const filtersMoved =
                    naming.moveIds.length > 0
                        ? moveToSection(
                              naming.moveIds,
                              section.id,
                              [...sections, section],
                              // The creation is the event, with filtersMoved
                              null,
                          )
                        : 0;
                track({
                    name: EventName.DASHBOARD_SECTION_CREATED,
                    properties: {
                        ...eventBase,
                        source: naming.source,
                        filtersMoved,
                        wasTipShown: isTipShown,
                    },
                });
                setNaming(null);
            }}
            // A cancelled name moves nothing and keeps the selection
            onCancel={() => setNaming(null)}
            cancelFocusSelector={
                naming.source === 'new_section_capsule' ||
                naming.source === 'new_section_drop'
                    ? NEW_SECTION_SELECTOR
                    : ADD_FILTER_SELECTOR
            }
        />
    );

    if (isViewer) {
        return (
            <Box
                className={classes.flow}
                data-sectioned={sections.length > 0 || undefined}
            >
                <AddControl />
                {pills}
                {capsules}
            </Box>
        );
    }

    const allRules = groupRulesBySection(dashboardFilters, sections).flatMap(
        ({ rules }) => rules,
    );
    // The bar's end: a capsule that starts a section, once there is a filter
    const isGhostShown = allRules.length > 0;
    const fieldOf = ({ rule, group }: SectionRule) =>
        getDashboardFilterField<DashboardFilterableField>(
            group === 'metrics'
                ? allFilterableMetricsMap
                : allFilterableFieldsMap,
            rule,
            filterableFieldsByTileUuid,
        ) ?? null;
    const nameOf = (id: string) => {
        if (id === UNSECTIONED_TARGET_ID || id === BAR_SPACE_TARGET_ID)
            return 'the space outside any section';
        if (id === NEW_SECTION_TARGET_ID) return 'a new section';
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
    // A bar write that changed sections, tracked with how many filters moved
    const trackMoved = (count: number, method: DashboardFiltersMovedMethod) => {
        if (count > 0)
            track({
                name: EventName.DASHBOARD_FILTERS_MOVED,
                properties: {
                    ...eventBase,
                    method,
                    count,
                    whileEditing: isEditing,
                },
            });
    };
    // Pills into a section (null: out of theirs), in display order; the
    // selection ends and the first moved pill takes focus, else "Add filter".
    // Returns how many changed section; a null method tracks no move
    const moveToSection = (
        ids: string[],
        sectionId: string | null,
        knownSections: DashboardControlSection[],
        method: DashboardFiltersMovedMethod | null,
    ) => {
        const moved = moveRulesToSection(
            dashboardFilters,
            ids,
            sectionId,
            knownSections,
        );
        clearSelection();
        focusAfter.current = [
            ...(ids[0] === undefined ? [] : [pillSelector(ids[0])]),
            ADD_FILTER_SELECTOR,
        ];
        if (moved === dashboardFilters) return 0;
        setDashboardFilters(moved);
        setHaveFiltersChanged(true);
        const count = countSectionChanges(
            dashboardFilters,
            moved,
            knownSections,
        );
        if (method !== null) trackMoved(count, method);
        return count;
    };
    const moveSelected = (
        sectionId: string | null,
        method: DashboardFiltersMovedMethod,
    ) => moveToSection(selected, sectionId, sections, method);
    const removeSelected = () => {
        setDashboardFilters((filters) =>
            selected.reduce(removeFilterRule, filters),
        );
        setHaveFiltersChanged(true);
        clearSelection();
        focusAfter.current = [ADD_FILTER_SELECTOR];
    };
    const isUnsectionTarget = (id: string) =>
        id === UNSECTIONED_TARGET_ID || id === BAR_SPACE_TARGET_ID;
    const leavingKindOf = (id: string): FilterGroup | null => {
        const found = allRules.find(({ rule }) => rule.id === id);
        if (found === undefined) return null;
        return (selected.length > 1 && selected.includes(id)) ||
            sectionOfRule(found.rule) !== null
            ? found.group
            : null;
    };
    const isSelectionDragged =
        draggedId !== null &&
        selected.length > 1 &&
        selected.includes(draggedId);
    const handleDragEnd = ({ active, over }: DragEndEvent) => {
        setDraggedId(null);
        const activeId = String(active.id);
        if (active.data?.current?.kind === SECTION_DRAG) {
            moveSection(activeId, over ? String(over.id) : undefined);
            return;
        }
        // Onto the New section capsule: name it, then the pill (or the
        // selection it carries) moves in; no section starts during an edit
        if (over && String(over.id) === NEW_SECTION_TARGET_ID) {
            if (isEditing) return;
            setNaming({
                moveIds:
                    selected.length > 1 && selected.includes(activeId)
                        ? selected
                        : [activeId],
                source: 'new_section_drop',
            });
            return;
        }
        // A picked pill carries the selection: all of them join the target's section
        if (over && selected.length > 1 && selected.includes(activeId)) {
            const overId = String(over.id);
            // Dropped back on itself: nothing moves
            if (overId === activeId) return;
            const overRule = allRules.find(({ rule }) => rule.id === overId);
            moveSelected(
                isUnsectionTarget(overId)
                    ? null
                    : overRule
                      ? sectionOfRule(overRule.rule)
                      : overId,
                'drag',
            );
            return;
        }
        if (!over || active.id === over.id) return;
        const overId = String(over.id);
        const activeRule = allRules.find(({ rule }) => rule.id === activeId);
        if (!activeRule) return;
        const currentSectionId = sectionOfRule(activeRule.rule);
        const target = isUnsectionTarget(overId)
            ? { sectionId: null }
            : sections.some((s) => s.id === overId)
              ? { sectionId: overId }
              : { ruleId: overId };
        if ('sectionId' in target && target.sectionId === currentSectionId)
            return;
        // The edited filter moves through the editor, so Cancel puts it back
        if (isEditing && activeId === editingFilterId) {
            moveEditedFilter(target, sections);
            return;
        }
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
        trackMoved(
            countSectionChanges(dashboardFilters, moved, sections),
            'drag',
        );
    };
    const dragged = allRules.find(({ rule }) => rule.id === draggedId);
    const draggedSection = sections.find(({ id }) => id === draggedId);
    const draggedField = dragged ? fieldOf(dragged) : null;

    return (
        <BarSelectionContext.Provider value={selection}>
            <DndContext
                sensors={sensors}
                collisionDetection={underPointerFor}
                accessibility={{ announcements: getDragAnnouncements(nameOf) }}
                onDragStart={({ active }: DragStartEvent) =>
                    setDraggedId(String(active.id))
                }
                onDragEnd={handleDragEnd}
                onDragCancel={() => setDraggedId(null)}
            >
                <BarSpace
                    leavingKindOf={leavingKindOf}
                    isSectioned={sections.length > 0}
                >
                    <UnsectionTarget
                        looseEnd={isViewer ? undefined : looseEnds[LOOSE_START]}
                    >
                        <AddControl />
                    </UnsectionTarget>
                    {pills}
                    {capsules}
                    {naming === null && isGhostShown && (
                        <InertWhileEditing>
                            <NewSectionGhost
                                isDisabled={isEditing}
                                onClick={() =>
                                    setNaming({
                                        moveIds: selected,
                                        source: 'new_section_capsule',
                                    })
                                }
                            />
                        </InertWhileEditing>
                    )}
                    {newSection}
                </BarSpace>
                {/* On the body, so the bar's overflow doesn't clip the copy */}
                {createPortal(
                    <DragOverlay>
                        {draggedSection ? (
                            <Group
                                gap="xs"
                                wrap="nowrap"
                                className={classes.dragPreview}
                            >
                                <Text fz="sm" fw={600} truncate>
                                    {draggedSection.name}
                                </Text>
                            </Group>
                        ) : isSelectionDragged ? (
                            <Group
                                gap="xs"
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
                                    gap="xs"
                                    wrap="nowrap"
                                    className={classes.dragPreview}
                                >
                                    {draggedField ? (
                                        <FieldIcon
                                            item={draggedField}
                                            size={14}
                                        />
                                    ) : (
                                        <MantineIcon
                                            icon={IconFilter}
                                            size={14}
                                        />
                                    )}
                                    <Text fz="xs" fw={500} truncate>
                                        {nameOf(dragged.rule.id)}
                                    </Text>
                                </Group>
                            )
                        )}
                    </DragOverlay>,
                    document.body,
                )}
                {selected.length > 0 && !isEditing && (
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
                        onMove={(sectionId) =>
                            moveSelected(sectionId, 'selection_bar')
                        }
                        onMoveToNewSection={(source) =>
                            setNaming({ moveIds: selected, source })
                        }
                        onRemove={removeSelected}
                        onClear={clearSelection}
                    />
                )}
            </DndContext>
        </BarSelectionContext.Provider>
    );
};
