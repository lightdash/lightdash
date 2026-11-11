import {
    DndContext,
    DragOverlay,
    KeyboardSensor,
    PointerSensor,
    useDraggable,
    useDroppable,
    useSensor,
    useSensors,
    type Active,
    type DragEndEvent,
    type DragMoveEvent,
    type DragStartEvent,
    type Over,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import {
    assertUnreachable,
    DashboardControlRefKind,
    getDashboardFilterField,
    interpolateUiString,
    type OrderedDashboardControl,
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
    VisuallyHidden,
} from '@mantine/core';
import {
    IconAdjustmentsHorizontal,
    IconCalendarSearch,
    IconChevronDown,
    IconChevronRight,
    IconFilter,
    IconPlus,
} from '@tabler/icons-react';
import { isEqual, partition } from 'es-toolkit/compat';
import {
    forwardRef,
    useCallback,
    useContext,
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
import { useStableCallback } from '../../hooks/useStableCallback';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    type DashboardFiltersMovedMethod,
    type DashboardSectionCreatedSource,
} from '../../providers/Tracking/types';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import {
    dashboardEditActions,
    selectHasStoredControlOrder,
    selectOrderedControls,
    selectControlSections,
    selectParameterControls,
    selectDashboardFilters,
    selectSavedFilterOverrides,
    useDashboardDispatch,
    useDashboardSelector,
    useDashboardStore,
} from '../dashboard/store';
import {
    isFilterHiddenOnTab,
    useFilterTabPlacement,
} from '../dashboardFilters/ActiveFilters/useFilterTabPlacement';
import { AddControl, InertWhileEditing } from './AddControl';
import {
    BarDropContext,
    BarMoveContext,
    BarSelectionContext,
    formatPickedCount,
    MOVE_KEYS,
    type BarSelection,
} from './barSelection';
import {
    getShownBarLines,
    moveControlBy,
    placeControl,
    toControlRefs,
    type ControlPlacement,
    type MoveDirection,
} from './controlOrder';
import { dateZoomPillSelector } from './dateZoomControls';
import { DateZoomPills } from './DateZoomPills';
import { formatSectionCount } from './fieldLabels';
import { FilterPills } from './FilterPills';
import pillClasses from './FilterPills.module.css';
import {
    chooseInsertionPoint,
    type BarItem,
    type BarLayout,
} from './insertionPoints';
import { focusAfterNaming, useRefocusAfter, type NameExit } from './nameFocus';
import { ParameterPills } from './ParameterPills';
import { DropLine } from './PillDraggable';
import classes from './SectionedFilters.module.css';
import { SectionMenu } from './SectionMenu';
import { SectionNameInput } from './SectionNameInput';
import {
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
    type SectionRule,
    isCollapsedByDefault,
    removeSectionFromRules,
    SECTION_DRAG,
    underPointerFor,
    besidePointer,
    lineGapPlacementOf,
    lineGapTargetId,
} from './sections';
import { SelectionBar } from './SelectionBar';
import { isEditingIn, isNewFilterIn, removeFilterRule } from './sidebarState';
import { useOrderSectionChanges } from './useControlOrder';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { useDateZoomBar } from './useDateZoomBar';
import { useDateZoomEditorSelector } from './useDateZoomEditor';
import { hasOpenLayer } from './useEditorDismiss';
import { useIsControlEdited } from './useIsControlEdited';
import {
    getParameterEntryName,
    useParameterBarControls,
} from './useParameterBarControls';
import { useParameterEditorSelector } from './useParameterEditor';

const ADD_FILTER_SELECTOR =
    '[data-filter-actions] > button[data-dashboard-filter-control]';
const NEW_SECTION_SELECTOR = '[data-new-section]';
// A pill's box holds its own drag and buttons (a parameter's remove, an
// unresolved filter's), wherever they sit in it
const NOT_SECTION_HANDLE =
    '[data-pill-draggable], [data-controls-pill], [data-parameter-pill], [data-date-zoom-pill], [data-section-actions]';
const pillSelector = (id: string) => `[data-controls-pill="${id}"]`;
const sectionNameSelector = (id: string) => `[data-section-name="${id}"]`;
const sectionAddSelector = (id: string) => `[data-section-add="${id}"]`;

/** An editor's capsule controls; a viewer's capsule has none. */
type CapsuleActions = {
    /** A filter is edited: the name, + and menu are inert. */
    isLocked: boolean;
    /** Alt with an arrow on the name: along the bar, or to the line above or below */
    onMove: (direction: MoveDirection) => void;
    onRename: (name: string) => void;
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
    triggerClassName: string | undefined;
    actions: CapsuleActions | null;
    /** Where the drag would land: beside it, or last in it */
    drop: 'before' | 'after' | 'into' | undefined;
    /** A line beside it on the row nearest the pointer, from its top (default its first row) */
    dropTop: number | null;
    /** Its parameter controls on the tab in view, drawn after its filters. */
    parameterCount: number;
    hasParameterMembers: boolean;
    withParameters: boolean;
    /** Its date zooms with a pill on the tab in view, drawn after its parameter controls. */
    dateZoomCount: number;
    hasDateZoomMembers: boolean;
    withDateZooms: boolean;
    /** With a stored order: its members in that order (default its filters, then its parameter controls) */
    renderMembers: (() => ReactNode) | null;
};

const SectionCapsule: FC<CapsuleProps> = ({
    section,
    rules,
    visibleRules,
    isChanged,
    isOpen,
    onToggle,
    activeTabUuid,
    triggerClassName,
    actions,
    drop,
    dropTop,
    parameterCount,
    withParameters,
    hasParameterMembers,
    dateZoomCount,
    hasDateZoomMembers,
    withDateZooms,
    renderMembers,
}) => {
    const getUiString = useUiStrings();
    const summaryId = useId();
    const [isRenaming, setIsRenaming] = useState(false);
    const { ref: nameRef, exit: renameExit } = useRefocusAfter(isRenaming);
    const changedCount = visibleRules.filter(isChanged).length;
    // A keyboard drag's target; a pointer's is `chooseInsertionPoint`'s
    const { setNodeRef } = useDroppable({
        id: section.id,
        data: { kind: SECTION_DRAG },
    });
    // An editor drags the capsule from anywhere but its pills and actions
    const isDraggable = actions !== null && !actions.isLocked && !isRenaming;
    const head = useDraggable({
        id: section.id,
        data: { kind: SECTION_DRAG },
        disabled: !isDraggable,
    });
    const chevronLabel = interpolateUiString(
        getUiString(
            isOpen ? 'controls.collapseSection' : 'controls.expandSection',
        ),
        { section: section.name },
    );
    // Nothing to show on this tab (an editor's bar only): the member count
    // Date zooms count with parameters: both read as controls
    const controlCount = parameterCount + dateZoomCount;
    const hasVisible = visibleRules.length > 0 || controlCount > 0;
    const isFolded = !(isOpen && hasVisible);
    const isEditorOnAdd = useControlsSidebarSelector(
        (c) =>
            isNewFilterIn(c, [section.id]) ||
            (isFolded && isEditingIn(c, section.id)),
    );
    const summary = !hasVisible
        ? formatSectionCount(getUiString, rules.length, controlCount)
        : changedCount > 0
          ? interpolateUiString(getUiString('filters.sectionChanged'), {
                changed: changedCount,
            })
          : formatSectionCount(getUiString, visibleRules.length, controlCount);

    const headNode =
        actions === null ? (
            <UnstyledButton
                className={`${classes.toggle} mantine-focus-auto`}
                aria-expanded={isOpen}
                aria-describedby={isFolded ? summaryId : undefined}
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
            <Group
                ref={head.setNodeRef}
                gap={0}
                wrap="nowrap"
                className={classes.head}
                data-section-head
            >
                {/* An editor's chevron only folds; the name renames */}
                <Tooltip label={chevronLabel}>
                    <ActionIcon
                        size="sm"
                        radius="xl"
                        aria-label={chevronLabel}
                        aria-expanded={isOpen}
                        aria-describedby={isFolded ? summaryId : undefined}
                        onClick={onToggle}
                    >
                        <MantineIcon
                            icon={isOpen ? IconChevronDown : IconChevronRight}
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
                            if (name !== section.name) actions.onRename(name);
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
                        aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown"
                        onClick={() => setIsRenaming(true)}
                        onKeyDown={(event) => {
                            const direction = MOVE_KEYS[event.key];
                            if (!event.altKey || direction === undefined)
                                return;
                            event.preventDefault();
                            actions.onMove(direction);
                        }}
                    >
                        {section.name}
                    </Button>
                )}
            </Group>
        );

    const actionsNode = actions !== null && (
        <Group
            gap={2}
            wrap="nowrap"
            className={`${classes.actions} ${pillClasses.inert}`}
            inert={actions.isLocked || undefined}
            data-section-end
            data-section-actions
        >
            {drop === 'into' && <DropLine side="before" />}
            <AddControl
                section={{
                    id: section.id,
                    name: section.name,
                    isEditorOpen: isEditorOnAdd,
                    allowParameters: withParameters,
                }}
            />
            <SectionMenu
                label={`${section.name} menu`}
                hasMembers={
                    rules.length > 0 ||
                    hasParameterMembers ||
                    hasDateZoomMembers
                }
                onRename={() => setIsRenaming(true)}
                onRemove={actions.onRemove}
            />
        </Group>
    );

    return (
        <Box
            ref={setNodeRef}
            role="group"
            aria-label={section.name}
            className={classes.capsule}
            data-collapsed={isFolded || undefined}
            data-editable={actions !== null || undefined}
            data-section-capsule={section.id}
            data-over={drop === 'into' || undefined}
            data-section-drop={
                drop === 'before' || drop === 'after' ? drop : undefined
            }
            data-dragging={head.isDragging || undefined}
            data-can-drag={isDraggable || undefined}
            // A pointer anywhere on the capsule drags it, except on a pill (its
            // own drag), the trailing actions or a portalled menu
            onPointerDown={
                isDraggable
                    ? (event) => {
                          if (
                              event.target instanceof Element &&
                              event.currentTarget.contains(event.target) &&
                              event.target.closest(NOT_SECTION_HANDLE) === null
                          )
                              head.listeners?.onPointerDown?.(event);
                      }
                    : undefined
            }
        >
            {(drop === 'before' || drop === 'after') && (
                <DropLine side={drop} top={dropTop} />
            )}
            {headNode}
            {isFolded ? (
                <Text
                    span
                    id={summaryId}
                    fz="xs"
                    c="dimmed"
                    className={classes.summary}
                    data-section-end={actions !== null || undefined}
                >
                    {summary}
                </Text>
            ) : renderMembers !== null ? (
                renderMembers()
            ) : (
                <>
                    <FilterPills
                        activeTabUuid={activeTabUuid}
                        sectionId={section.id}
                        triggerClassName={triggerClassName}
                    />
                    {withParameters && (
                        <ParameterPills
                            sectionId={section.id}
                            isInBarContext={actions !== null}
                        />
                    )}
                    {withDateZooms && (
                        <DateZoomPills
                            sectionId={section.id}
                            isInBarContext={actions !== null}
                        />
                    )}
                </>
            )}
            {actionsNode}
        </Box>
    );
};

// For an editor, the gap above a bar line (and below the last) that takes
// a dragged control onto a line of its own
const LineGap: FC<{
    lineStartId: string | null;
    isEnd: boolean;
    isShown: boolean;
}> = ({ lineStartId, isEnd, isShown }) => {
    const { setNodeRef } = useDroppable({
        id: lineGapTargetId(lineStartId),
        data: { kind: SECTION_DRAG, isLineGap: true },
    });
    return (
        <Box
            ref={setNodeRef}
            className={classes.lineGap}
            data-end={isEnd || undefined}
            data-over={isShown || undefined}
            aria-hidden
        />
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

// The bar's first button: a keyboard drag's target out of a section; a
// pointer drag's line after it starts the bar
const UnsectionTarget: FC<{ children: ReactNode }> = ({ children }) => {
    const { setNodeRef } = useDroppable({ id: UNSECTIONED_TARGET_ID });
    const drop = useContext(BarDropContext);
    return (
        <Box
            ref={setNodeRef}
            className={classes.unsectionTarget}
            data-bar-start
        >
            {children}
            {drop !== null && 'barStart' in drop && <DropLine side="after" />}
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

// The bar's flow, measured for a pointer drag's insertion points
const BarSpace = forwardRef<
    HTMLDivElement,
    {
        isSectioned: boolean;
        /** Holds the gap below its only line, out of the layout */
        hasEndGap: boolean;
        children: ReactNode;
    }
>(({ isSectioned, hasEndGap, children }, ref) => (
    <Box
        ref={ref}
        className={classes.flow}
        data-sectioned={isSectioned || undefined}
        data-end-gap={hasEndGap || undefined}
    >
        {children}
    </Box>
));

const OVERLAY_MODIFIERS = [besidePointer];

type Props = {
    activeTabUuid: string | undefined;
    /** Before everything on the first line, wrapping with the controls (default none). */
    leading?: ReactNode;
    /** A viewer's bar before the pills (default: `AddControl`); an embed passes its own. */
    viewerActions?: ReactNode;
    /** An embed's class contract hook on each pill (default none). */
    triggerClassName?: string;
    /** Parameter controls after the filters in each pass (default true; an embed may hide them). */
    withParameters?: boolean;
    /** Date zooms after the parameter controls (default true; off in an embed without date zoom). */
    withDateZooms?: boolean;
};

// The filter area of a dashboard with sections: Add, then the unsectioned
// pass (the unsectioned saved pills, the viewer's own), then one outlined
// capsule per section with a member on this tab (its toggle, then its pills
// inline), then an editor's entry (the New section capsule, or the new
// section's name). Collapsing is local state keyed by section id, as the
// ids whose state differs from their default. In edit mode one drag context spans the passes: a pill dropped
// on a pill takes its place and section, on a capsule joins that section
// last, on the first button or the bar's empty space leaves its section
export const SectionedFilters: FC<Props> = ({
    activeTabUuid,
    leading,
    viewerActions = <AddControl />,
    triggerClassName,
    withParameters = true,
    withDateZooms = true,
}) => {
    const [flippedIds, setFlippedIds] = useState<Set<string>>(() => new Set());
    const [draggedId, setDraggedId] = useState<string | null>(null);
    // Where a dragged control would land, while that moves something: the
    // drop line beside a capsule or across the gap between lines
    const [drop, setDrop] = useState<ControlPlacement | null>(null);
    // Beside a capsule of several rows, the line's top on the row by the pointer
    const [dropTop, setDropTop] = useState<number | null>(null);
    // The bar's flow, measured when a pointer drag moves
    const barRef = useRef<HTMLDivElement>(null);
    // The pointer as collision detection last saw it, in the viewport after
    // any scroll; null for a keyboard drag
    const pointerRef = useRef<{ x: number; y: number } | null>(null);
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
    const getUiString = useUiStrings();
    const isViewer = useControlsSidebarSelector((c) => c.isViewer);
    // A viewer's flips last for one visit: a mode change starts from the saved state
    const [flipsMode, setFlipsMode] = useState(isViewer);
    if (flipsMode !== isViewer) {
        setFlipsMode(isViewer);
        setFlippedIds(new Set());
    }
    // A filter or a parameter control: either locks the section controls
    const isEditing = useIsControlEdited();
    // A filter being created is no move: Cancel takes it out
    const newFilterId = useControlsSidebarSelector((c) =>
        c.isNew ? (c.editing?.filterId ?? null) : null,
    );
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
    const store = useDashboardStore();
    const orderSectionChanges = useOrderSectionChanges();
    // Every control in bar order; with a stored order the bar follows it
    const ordered = useDashboardSelector(selectOrderedControls);
    const hasStoredOrder = useDashboardSelector(selectHasStoredControlOrder);
    const dropOrder = useMemo(() => ordered.map(({ id }) => id), [ordered]);
    const { track } = useTracking();
    const dashboardUuid = useDashboardContext((c) => c.dashboard?.uuid);
    const sections = useDashboardSelector(selectControlSections);
    // A new key per move, so the same words are announced again
    const [moveStatus, setMoveStatus] = useState({ key: 0, text: '' });
    const savedSections = useDashboardContext(
        (c) => c.dashboard?.config?.controlSections,
    );
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
    const parameterBar = useParameterBarControls();
    const parameterControls = useDashboardSelector(selectParameterControls);
    // A hidden control is an editor's: a viewer's section of only hidden ones has no pill, so no capsule
    const parameterEntries = withParameters
        ? parameterBar.entries.filter(
              ({ isNeedsValue, control }) =>
                  !isNeedsValue && !(isViewer && control.hidden),
          )
        : [];
    const parameterCountOf = (sectionId: string | null) =>
        parameterEntries.filter((entry) => entry.sectionId === sectionId)
            .length;
    const moveParameter = useParameterEditorSelector((c) => c.move);
    const removeParameter = useParameterEditorSelector((c) => c.remove);
    const editedParameterId = useParameterEditorSelector((c) => c.editingId);
    const editedParameterSectionId =
        parameterEntries.find(({ control }) => control.id === editedParameterId)
            ?.sectionId ?? null;
    // Named date zooms with a pill; one being added has no place yet
    const zoomBar = useDateZoomBar();
    const dateZoomEntries = withDateZooms
        ? zoomBar.filter(({ isNew }) => !isNew)
        : [];
    const dateZoomCountOf = (sectionId: string | null) =>
        dateZoomEntries.filter((entry) => entry.sectionId === sectionId).length;
    const setZoomSection = useDateZoomEditorSelector((c) => c.setSection);
    const removeZoom = useDateZoomEditorSelector((c) => c.remove);
    const editedZoomId = useDateZoomEditorSelector((c) => c.editingId);
    const editedZoomSectionId =
        dateZoomEntries.find(({ control }) => control.uuid === editedZoomId)
            ?.sectionId ?? null;
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
                  return visibleRules.length === 0 &&
                      parameterCountOf(section.id) === 0 &&
                      dateZoomCountOf(section.id) === 0 &&
                      isViewer
                      ? []
                      : [{ section, rules, visibleRules }];
              },
          );
    // An editor sees the saved way to start; only a viewer's flips are local
    const isOpen = (section: DashboardControlSection, total: number) =>
        !isCollapsedByDefault(section, total) !==
        (isViewer && flippedIds.has(section.id));
    // The pills on screen in bar order: each open capsule's, then the
    // unsectioned ones; a folded capsule's are left out. Read when a pill is
    // picked, so the selection does not change with it
    const isShownOnTab = (rule: DashboardFilterRule) =>
        !isFilterHiddenOnTab(getTabsUsingFilter(rule), activeTabUuid);
    const looseRules = groupRulesBySection(dashboardFilters, sections)
        .filter(({ section }) => section === null)
        .flatMap(({ rules }) => rules);
    const looseOnTab = looseRules.filter(({ rule }) => isShownOnTab(rule));
    // Each pass's filters, then its parameter controls
    const parameterIdsIn = (sectionId: string | null) =>
        parameterEntries
            .filter((entry) => entry.sectionId === sectionId)
            .map(({ control }) => control.id);
    const dateZoomIdsIn = (sectionId: string | null) =>
        dateZoomEntries
            .filter((entry) => entry.sectionId === sectionId)
            .map(({ control }) => control.uuid);
    const groupById = new Map(groups.map((group) => [group.section.id, group]));
    // On this bar: a filter on the tab, a parameter control with a pill, a
    // section with a capsule
    const isShownOnBar = (control: OrderedDashboardControl): boolean => {
        switch (control.kind) {
            case DashboardControlRefKind.FILTER:
                return isShownOnTab(control.rule);
            case DashboardControlRefKind.PARAMETER:
                return parameterEntries.some(
                    (entry) => entry.control.id === control.id,
                );
            case DashboardControlRefKind.SECTION:
                return groupById.has(control.id);
            case DashboardControlRefKind.DATE_ZOOM:
                return dateZoomEntries.some(
                    (entry) => entry.control.uuid === control.id,
                );
            default:
                return assertUnreachable(control, 'Unknown bar control');
        }
    };
    const nameOfControl = (control: OrderedDashboardControl): string => {
        switch (control.kind) {
            case DashboardControlRefKind.FILTER:
                return (
                    control.rule.label ||
                    getDashboardFilterField<DashboardFilterableField>(
                        control.group === 'metrics'
                            ? allFilterableMetricsMap
                            : allFilterableFieldsMap,
                        control.rule,
                        filterableFieldsByTileUuid,
                    )?.label ||
                    control.rule.target.fieldId
                );
            case DashboardControlRefKind.PARAMETER: {
                const entry = parameterEntries.find(
                    (candidate) => candidate.control.id === control.id,
                );
                return entry
                    ? getParameterEntryName(entry)
                    : (control.label ?? 'a parameter');
            }
            case DashboardControlRefKind.SECTION:
                return (
                    control.section.name ||
                    getUiString('controls.untitledSection')
                );
            case DashboardControlRefKind.DATE_ZOOM:
                return control.control.name;
            default:
                return assertUnreachable(control, 'Unknown bar control');
        }
    };
    const isOpenById = (sectionId: string) => {
        const group = groupById.get(sectionId);
        return group !== undefined && isOpen(group.section, group.rules.length);
    };
    const barOrder = hasStoredOrder
        ? ordered
              .filter(
                  (control) =>
                      control.kind !== DashboardControlRefKind.SECTION &&
                      isShownOnBar(control) &&
                      (control.sectionId === null ||
                          isOpenById(control.sectionId)),
              )
              .map(({ id }) => id)
        : [
              ...looseOnTab.map(({ rule }) => rule.id),
              ...parameterIdsIn(null),
              ...dateZoomIdsIn(null),
              ...groups.flatMap(({ section, rules, visibleRules }) =>
                  isOpen(section, rules.length)
                      ? [
                            ...visibleRules.map(({ id }) => id),
                            ...parameterIdsIn(section.id),
                            ...dateZoomIdsIn(section.id),
                        ]
                      : [],
              ),
          ];
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

    // A reorder writes the order at once, as a section move: no edit, so a
    // filter's Cancel keeps it and the page's Cancel puts it back
    const arrange = (next: OrderedDashboardControl[]) => {
        if (next === ordered) return;
        dispatch(dashboardEditActions.arrangeControls(toControlRefs(next)));
    };
    // Where a control's element is, to keep focus on it after a move
    const focusSelectorOf = ({ kind, id }: OrderedDashboardControl) =>
        kind === DashboardControlRefKind.SECTION
            ? sectionNameSelector(id)
            : kind === DashboardControlRefKind.PARAMETER
              ? `[data-parameter-pill="${id}"]`
              : kind === DashboardControlRefKind.DATE_ZOOM
                ? dateZoomPillSelector(id)
                : pillSelector(id);
    // Alt with an arrow on a pill or a section's name; the control keeps focus
    const moveByKeyboard = useStableCallback(
        (id: string, direction: MoveDirection) => {
            const next = moveControlBy(ordered, id, direction, isShownOnBar);
            const moved = next.find((control) => control.id === id);
            if (next === ordered || moved === undefined) return;
            const name = nameOfControl(moved);
            const section =
                moved.sectionId === null
                    ? undefined
                    : sections.find(({ id: key }) => key === moved.sectionId);
            const shownLines = getShownBarLines(next, isShownOnBar);
            const line = shownLines.findIndex((members) =>
                members.includes(moved),
            );
            setMoveStatus(({ key }) => ({
                key: key + 1,
                text:
                    section === undefined
                        ? `${name} moved to line ${line + 1}, position ${
                              shownLines[line].indexOf(moved) + 1
                          }`
                        : `${name} moved to position ${
                              next
                                  .filter(
                                      (control) =>
                                          control.sectionId === section.id &&
                                          (control === moved ||
                                              isShownOnBar(control)),
                                  )
                                  .indexOf(moved) + 1
                          } in ${section.name}`,
            }));
            focusAfter.current = [focusSelectorOf(moved)];
            arrange(next);
        },
    );
    // Without a stored order each section starts its own line
    const lines = sections
        .filter(({ id }) => groupById.has(id))
        .map((section) => [section]);
    // A capsule's drop line: beside it, last in it, or after it for a member
    // leaving it by keyboard on the first button
    const capsuleDropOf = (
        sectionId: string,
    ): 'before' | 'after' | 'into' | undefined => {
        if (drop === null) return undefined;
        if ('overId' in drop)
            return drop.overId === sectionId ? drop.side : undefined;
        if (!('sectionId' in drop)) return undefined;
        if (drop.sectionId === sectionId) return 'into';
        return drop.sectionId === null &&
            draggedId !== null &&
            ordered.some(
                ({ id, sectionId: memberOf }) =>
                    id === draggedId && memberOf === sectionId,
            )
            ? 'after'
            : undefined;
    };
    const capsuleFor = (
        { section, rules, visibleRules }: (typeof groups)[number],
        renderMembers: (() => ReactNode) | null,
    ) => (
        <SectionCapsule
            key={section.id}
            renderMembers={renderMembers}
            drop={capsuleDropOf(section.id)}
            dropTop={dropTop}
            section={section}
            rules={rules}
            visibleRules={visibleRules}
            isChanged={isChanged}
            // The edited control's section stays open, so its editor does
            isOpen={
                isOpen(section, rules.length) ||
                editedParameterSectionId === section.id ||
                editedZoomSectionId === section.id
            }
            onToggle={() => {
                // An editor's fold is the saved way to start; back at the size
                // rule's value with nothing saved, it follows the rule again
                if (!isViewer) {
                    const collapsed = isOpen(section, rules.length);
                    const isSizeDefault =
                        collapsed ===
                        isCollapsedByDefault(
                            { id: section.id, name: section.name },
                            rules.length,
                        );
                    const savedCollapsed = savedSections?.find(
                        ({ id }) => id === section.id,
                    )?.collapsed;
                    dispatch(
                        dashboardEditActions.setControlSectionCollapsed({
                            id: section.id,
                            collapsed:
                                isSizeDefault && savedCollapsed === undefined
                                    ? undefined
                                    : collapsed,
                        }),
                    );
                    return;
                }
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
                toggle(section.id);
            }}
            activeTabUuid={activeTabUuid}
            triggerClassName={triggerClassName}
            parameterCount={parameterCountOf(section.id)}
            hasParameterMembers={
                withParameters &&
                (parameterControls?.some(
                    (control) => control.sectionId === section.id,
                ) ??
                    false)
            }
            withParameters={withParameters}
            dateZoomCount={dateZoomCountOf(section.id)}
            withDateZooms={withDateZooms}
            hasDateZoomMembers={dateZoomEntries.some(
                (entry) => entry.sectionId === section.id,
            )}
            actions={
                isViewer
                    ? null
                    : {
                          isLocked: isEditing,
                          onMove: (direction) =>
                              moveByKeyboard(section.id, direction),
                          onRename: (name) =>
                              dispatch(
                                  dashboardEditActions.renameControlSection({
                                      ...section,
                                      name,
                                  }),
                              ),
                          onRemove: () => {
                              // The menu leaves with its capsule
                              focusAfter.current = [ADD_FILTER_SELECTOR];
                              const before = store.getState();
                              dispatch(
                                  dashboardEditActions.removeControlSection(
                                      section.id,
                                  ),
                              );
                              if (rules.length > 0) {
                                  setDashboardFilters((filters) =>
                                      removeSectionFromRules(
                                          filters,
                                          section.id,
                                      ),
                                  );
                                  setHaveFiltersChanged(true);
                              }
                              orderSectionChanges(before);
                          },
                      }
            }
        />
    );
    const isGapShown = (lineStartId: string | null) =>
        drop !== null &&
        'lineStartId' in drop &&
        drop.lineStartId === lineStartId;
    // The bar's end ("New section" or its name input) closes the last line
    const renderSectionLines = (end: ReactNode) =>
        lines.map((line, index) => (
            <Box key={line[0].id} className={classes.sectionLine}>
                {!isViewer && (
                    <LineGap
                        lineStartId={line[0].id}
                        isEnd={false}
                        isShown={isGapShown(line[0].id)}
                    />
                )}
                {line.map(({ id }) => {
                    const group = groupById.get(id);
                    return group ? capsuleFor(group, null) : null;
                })}
                {index === lines.length - 1 && end}
                {!isViewer && index === lines.length - 1 && (
                    <LineGap
                        lineStartId={null}
                        isEnd
                        isShown={isGapShown(null)}
                    />
                )}
            </Box>
        ));
    const pills = (
        <>
            <FilterPills
                activeTabUuid={activeTabUuid}
                sectionId={null}
                triggerClassName={triggerClassName}
            />
            {withParameters && (
                <ParameterPills sectionId={null} isInBarContext={!isViewer} />
            )}
            {withDateZooms && (
                <DateZoomPills sectionId={null} isInBarContext={!isViewer} />
            )}
        </>
    );

    // With a stored order: each run of one kind in one pass, each capsule in
    // a slot that takes a line of its own on a narrow bar
    const renderControls = (
        controls: OrderedDashboardControl[],
        sectionId: string | null,
    ) =>
        controls
            .reduce<OrderedDashboardControl[][]>((runs, control) => {
                const last = runs.at(-1);
                if (
                    last !== undefined &&
                    last[0].kind === control.kind &&
                    control.kind !== DashboardControlRefKind.SECTION
                )
                    last.push(control);
                else runs.push([control]);
                return runs;
            }, [])
            .map((run) => {
                const [first] = run;
                const ids = run.map(({ id }) => id);
                switch (first.kind) {
                    case DashboardControlRefKind.FILTER:
                        return (
                            <FilterPills
                                key={first.id}
                                activeTabUuid={activeTabUuid}
                                sectionId={sectionId}
                                triggerClassName={triggerClassName}
                                ruleIds={ids}
                                withExtras={false}
                            />
                        );
                    case DashboardControlRefKind.PARAMETER:
                        return (
                            withParameters && (
                                <ParameterPills
                                    key={first.id}
                                    sectionId={sectionId}
                                    isInBarContext={!isViewer}
                                    ids={ids}
                                />
                            )
                        );
                    case DashboardControlRefKind.SECTION: {
                        const group = groupById.get(first.id);
                        const members = ordered.filter(
                            (control) => control.sectionId === first.id,
                        );
                        return (
                            group && (
                                <Box key={first.id} className={classes.line}>
                                    {capsuleFor(group, () => (
                                        <>
                                            {renderControls(members, first.id)}
                                            <FilterPills
                                                activeTabUuid={activeTabUuid}
                                                sectionId={first.id}
                                                triggerClassName={
                                                    triggerClassName
                                                }
                                                ruleIds={[]}
                                            />
                                            {withDateZooms && (
                                                <DateZoomPills
                                                    sectionId={first.id}
                                                    ids={[]}
                                                    withNew
                                                />
                                            )}
                                        </>
                                    ))}
                                </Box>
                            )
                        );
                    }
                    case DashboardControlRefKind.DATE_ZOOM:
                        return (
                            withDateZooms && (
                                <DateZoomPills
                                    key={first.id}
                                    sectionId={sectionId}
                                    isInBarContext={!isViewer}
                                    ids={ids}
                                />
                            )
                        );
                    default:
                        return assertUnreachable(first, 'Unknown bar control');
                }
            });
    // The first load shows the skeletons alone
    const orderLines = isLoading
        ? [[]]
        : getShownBarLines(ordered, isShownOnBar);
    // Unmatched filters and "needs value" pills trail the bar
    const needsValueIds = parameterBar.entries
        .filter(({ isNeedsValue }) => isNeedsValue)
        .map(({ control }) => control.id);
    const barLines = getShownBarLines(ordered, () => true);
    const renderOrderLines = (firstItem: ReactNode, lastItem: ReactNode) =>
        orderLines.map((line, index) => {
            // A line's own first control, though it may be hidden on this tab
            const lineStartId =
                index === 0
                    ? null
                    : (barLines.find((members) =>
                          members.includes(line[0]),
                      )?.[0].id ?? line[0].id);
            const isLast = index === orderLines.length - 1;
            return (
                <Box
                    key={lineStartId ?? 'first-line'}
                    className={classes.orderLine}
                >
                    {!isViewer && lineStartId !== null && (
                        <LineGap
                            lineStartId={lineStartId}
                            isEnd={false}
                            isShown={isGapShown(lineStartId)}
                        />
                    )}
                    {index === 0 && firstItem}
                    {renderControls(line, null)}
                    {isLast && (
                        <>
                            <FilterPills
                                activeTabUuid={activeTabUuid}
                                sectionId={null}
                                triggerClassName={triggerClassName}
                                ruleIds={[]}
                            />
                            {withParameters && needsValueIds.length > 0 && (
                                <ParameterPills
                                    sectionId={null}
                                    ids={needsValueIds}
                                />
                            )}
                            {withDateZooms && (
                                <DateZoomPills
                                    sectionId={null}
                                    ids={[]}
                                    withNew
                                />
                            )}
                        </>
                    )}
                    {isLast && lastItem}
                    {!isViewer && isLast && (
                        <LineGap
                            lineStartId={null}
                            isEnd
                            isShown={isGapShown(null)}
                        />
                    )}
                </Box>
            );
        });

    // Saved sections sit below the filters outside any section; a new one is named inline
    const isSectionsOwnLine = lines.length > 0;

    // Named last, in the entry's place at the bar's end, wherever it was
    // started, so nothing before it moves
    const newSection = naming !== null && (
        <Box className={classes.line}>
            <NewSection
                onAdd={(name, exit) => {
                    const section = { id: uuidv4(), name };
                    focusNewSection.current = { id: section.id, exit };
                    dispatch(
                        dashboardEditActions.addControlSection({
                            section,
                            barOrder: toControlRefs(ordered),
                        }),
                    );
                    const before = store.getState();
                    const [zoomIds, otherIds] = partition(
                        naming.moveIds,
                        (id) =>
                            dateZoomEntries.some(
                                ({ control }) => control.uuid === id,
                            ),
                    );
                    const [parameterIds, ruleIds] = partition(otherIds, (id) =>
                        parameterEntries.some(
                            ({ control }) => control.id === id,
                        ),
                    );
                    const filtersMoved =
                        naming.moveIds.length > 0
                            ? moveToSection(
                                  ruleIds,
                                  section.id,
                                  [...sections, section],
                                  // The creation is the event, with filtersMoved
                                  null,
                              )
                            : 0;
                    // The parameter controls and date zooms it takes, once the section exists
                    moveParametersTo(parameterIds, section.id);
                    moveZoomsTo(zoomIds, section.id);
                    orderSectionChanges(before);
                    track({
                        name: EventName.DASHBOARD_SECTION_CREATED,
                        properties: {
                            ...eventBase,
                            source: naming.source,
                            filtersMoved,
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
        </Box>
    );

    if (isViewer && hasStoredOrder) {
        return (
            <Box
                className={classes.flow}
                data-sectioned={orderLines.length > 1 || undefined}
            >
                {renderOrderLines(
                    <>
                        {leading}
                        {viewerActions}
                    </>,
                    null,
                )}
            </Box>
        );
    }
    if (isViewer) {
        return (
            <Box
                className={classes.flow}
                data-sectioned={sections.length > 0 || undefined}
            >
                {leading}
                {viewerActions}
                {pills}
                <Box
                    className={classes.sections}
                    data-own-line={isSectionsOwnLine || undefined}
                >
                    {renderSectionLines(null)}
                </Box>
            </Box>
        );
    }

    const allRules = groupRulesBySection(dashboardFilters, sections).flatMap(
        ({ rules }) => rules,
    );
    // The bar's end: a capsule that starts a section, once there is a control
    const isGhostShown =
        allRules.length > 0 ||
        parameterEntries.length > 0 ||
        dateZoomEntries.length > 0;
    const fieldOf = ({ rule, group }: SectionRule) =>
        getDashboardFilterField<DashboardFilterableField>(
            group === 'metrics'
                ? allFilterableMetricsMap
                : allFilterableFieldsMap,
            rule,
            filterableFieldsByTileUuid,
        ) ?? null;
    const nameOf = (id: string) => {
        // As `placementOf` lands it: a member out of its section, else first
        if (id === UNSECTIONED_TARGET_ID)
            return draggedId !== null &&
                (controlOf(draggedId)?.sectionId ?? null) === null
                ? 'the start of the bar'
                : 'the space outside any section';
        if (id === NEW_SECTION_TARGET_ID) return 'a new section';
        const parameterEntry = parameterEntries.find(
            ({ control }) => control.id === id,
        );
        if (parameterEntry) return getParameterEntryName(parameterEntry);
        const zoomEntry = dateZoomEntries.find(
            ({ control }) => control.uuid === id,
        );
        if (zoomEntry) return zoomEntry.control.name;
        const section = sections.find((s) => s.id === id);
        if (section)
            return `section ${section.name || getUiString('controls.untitledSection')}`;
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
    // Picked parameter controls, in list order
    const selectedParameters = parameterEntries.filter(({ control }) =>
        selectedIds.includes(control.id),
    );
    const selectedParameterIds = selectedParameters.map(
        ({ control }) => control.id,
    );
    const selectedZooms = dateZoomEntries.filter(({ control }) =>
        selectedIds.includes(control.uuid),
    );
    const selectedZoomIds = selectedZooms.map(({ control }) => control.uuid);
    const allSelected = [
        ...selected,
        ...selectedParameterIds,
        ...selectedZoomIds,
    ];
    const sectionOfRule = (rule: DashboardFilterRule) =>
        isRuleInSection(rule, null, sections) ? null : (rule.sectionId ?? null);
    const selectedSectionIds = [
        ...new Set([
            ...allRules
                .filter(({ rule }) => selected.includes(rule.id))
                .map(({ rule }) => sectionOfRule(rule)),
            ...selectedParameters.map((entry) => entry.sectionId),
            ...selectedZooms.map((entry) => entry.sectionId),
        ]),
    ];
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
    // Parameter controls into a section (null: out of theirs), each last in it
    const moveParametersTo = (ids: string[], sectionId: string | null) => {
        ids.forEach((id) => moveParameter(id, { sectionId }));
        if (
            ids[0] !== undefined &&
            focusAfter.current?.[0] === ADD_FILTER_SELECTOR
        )
            focusAfter.current = [
                `[data-parameter-pill="${ids[0]}"]`,
                ADD_FILTER_SELECTOR,
            ];
    };
    // Date zooms into a section (null: out of theirs)
    const moveZoomsTo = (ids: string[], sectionId: string | null) => {
        ids.forEach((id) => setZoomSection(id, sectionId));
        if (
            ids[0] !== undefined &&
            focusAfter.current?.[0] === ADD_FILTER_SELECTOR
        )
            focusAfter.current = [
                dateZoomPillSelector(ids[0]),
                ADD_FILTER_SELECTOR,
            ];
    };
    // A section change is a reorder: the order is written with it
    const moveSelected = (
        sectionId: string | null,
        method: DashboardFiltersMovedMethod,
    ) => {
        const before = store.getState();
        const parameterIds = selectedParameterIds;
        const zoomIds = selectedZoomIds;
        const count = moveToSection(selected, sectionId, sections, method);
        moveParametersTo(parameterIds, sectionId);
        moveZoomsTo(zoomIds, sectionId);
        orderSectionChanges(before);
        return count;
    };
    const removeSelected = () => {
        if (selected.length > 0) {
            setDashboardFilters((filters) =>
                selected.reduce(removeFilterRule, filters),
            );
            setHaveFiltersChanged(true);
        }
        selectedParameterIds.forEach(removeParameter);
        selectedZoomIds.forEach(removeZoom);
        clearSelection();
        focusAfter.current = [ADD_FILTER_SELECTOR];
    };
    const controlOf = (id: string) =>
        ordered.find((control) => control.id === id);
    // A dragged capsule also lands beside a control outside every section
    const sectionTargetIds = new Set([
        UNSECTIONED_TARGET_ID,
        ...ordered
            .filter((control) => control.sectionId === null)
            .map(({ id }) => id),
    ]);
    const isSelectionDragged =
        draggedId !== null &&
        allSelected.length > 1 &&
        allSelected.includes(draggedId);
    // A keyboard drag's drop: over a line gap, a line of its own; over a
    // capsule, a section joins its line on the side of its centre the dragged
    // copy's centre is, anything else joins it last; over a control, beside
    // it on the side it moves towards; over the first button, out of its section
    const placementOf = (
        active: Active,
        over: Over | null,
    ): ControlPlacement | null => {
        if (over === null) return null;
        const activeId = String(active.id);
        const overId = String(over.id);
        if (overId === activeId) return null;
        const gap = lineGapPlacementOf(overId);
        if (gap !== null) return gap;
        // Out of its section, else first on the bar, as a pointer there does
        if (overId === UNSECTIONED_TARGET_ID)
            return (controlOf(activeId)?.sectionId ?? null) === null
                ? { barStart: true }
                : { sectionId: null };
        const over_ = controlOf(overId);
        if (over_ === undefined) return null;
        if (
            over_.kind === DashboardControlRefKind.SECTION &&
            active.data?.current?.kind === SECTION_DRAG
        ) {
            const dragged = active.rect.current.translated;
            return {
                overId,
                side:
                    dragged !== null &&
                    dragged.left + dragged.width / 2 <
                        over.rect.left + over.rect.width / 2
                        ? 'before'
                        : 'after',
            };
        }
        if (over_.kind === DashboardControlRefKind.SECTION)
            return { sectionId: overId };
        return {
            overId,
            side:
                dropOrder.indexOf(overId) < dropOrder.indexOf(activeId)
                    ? 'before'
                    : 'after',
        };
    };
    // The bar as drawn now: its lines, each control's box, a capsule's
    // head, trailing actions and open members
    const measureBar = (root: HTMLElement): BarLayout | null => {
        const start = root.querySelector('[data-bar-start]');
        if (start === null) return null;
        const elementOf = ({ kind, id }: OrderedDashboardControl) =>
            root.querySelector(
                kind === DashboardControlRefKind.SECTION
                    ? `[data-section-capsule="${id}"]`
                    : kind === DashboardControlRefKind.PARAMETER
                      ? `[data-parameter-pill="${id}"]`
                      : kind === DashboardControlRefKind.DATE_ZOOM
                        ? dateZoomPillSelector(id)
                        : pillSelector(id),
            );
        const rectOf = (element: Element | null) =>
            element === null ? null : element.getBoundingClientRect();
        const itemOf = (control: OrderedDashboardControl): BarItem[] => {
            const element = elementOf(control);
            if (element === null) return [];
            const rect = element.getBoundingClientRect();
            if (control.kind !== DashboardControlRefKind.SECTION)
                return [{ id: control.id, rect, section: null }];
            const ends = [...element.querySelectorAll('[data-section-end]')]
                .filter(
                    (end) => end.closest('[data-section-capsule]') === element,
                )
                .map((end) => end.getBoundingClientRect());
            const members = isOpenById(control.id)
                ? ordered
                      .filter(
                          (member) =>
                              member.sectionId === control.id &&
                              isShownOnBar(member),
                      )
                      .flatMap((member) => {
                          const memberRect = rectOf(elementOf(member));
                          return memberRect === null
                              ? []
                              : [{ id: member.id, rect: memberRect }];
                      })
                : [];
            return [
                {
                    id: control.id,
                    rect,
                    section: {
                        head: rectOf(
                            element.querySelector('[data-section-head]'),
                        ),
                        end:
                            ends.length === 0
                                ? null
                                : {
                                      left: Math.min(
                                          ...ends.map((r) => r.left),
                                      ),
                                      right: Math.max(
                                          ...ends.map((r) => r.right),
                                      ),
                                      top: Math.min(...ends.map((r) => r.top)),
                                      bottom: Math.max(
                                          ...ends.map((r) => r.bottom),
                                      ),
                                  },
                        members,
                    },
                },
            ];
        };
        const barLines = getShownBarLines(ordered, () => true);
        return {
            start: start.getBoundingClientRect(),
            lines: getShownBarLines(ordered, isShownOnBar).map(
                (line, index) => ({
                    lineStartId:
                        index === 0
                            ? null
                            : (barLines.find((members) =>
                                  members.includes(line[0]),
                              )?.[0].id ?? line[0].id),
                    items: line.flatMap(itemOf),
                }),
            ),
        };
    };
    // A pointer drag lands on the insertion point nearest the pointer, on
    // "New section" only right under it; a keyboard drag has no pointer.
    // Without collision detection (tests), the activator's point plus the move
    const pointerOf = ({ activatorEvent, delta }: DragMoveEvent) =>
        pointerRef.current ??
        (activatorEvent != null && 'clientX' in activatorEvent
            ? {
                  x: (activatorEvent as PointerEvent).clientX + delta.x,
                  y: (activatorEvent as PointerEvent).clientY + delta.y,
              }
            : null);
    // Only a control's drag, and never while the ghost is off (an edit)
    const isOnNewSection = (
        { x, y }: { x: number; y: number },
        active: Active,
    ) => {
        if (isEditing || active.data?.current?.kind === SECTION_DRAG)
            return false;
        const ghost = barRef.current?.querySelector(NEW_SECTION_SELECTOR);
        const rect = ghost?.getBoundingClientRect();
        return (
            rect !== undefined &&
            x >= rect.left &&
            x <= rect.right &&
            y >= rect.top &&
            y <= rect.bottom
        );
    };
    // A carried selection moves in bar order, the rest after the first
    const movedIdsOf = (activeId: string) =>
        allSelected.length > 1 && allSelected.includes(activeId)
            ? ordered
                  .filter(({ id }) => allSelected.includes(id))
                  .map(({ id }) => id)
            : [activeId];
    const placeAll = (ids: string[], placement: ControlPlacement) =>
        ids.reduce(
            (list, id, index) =>
                placeControl(
                    list,
                    id,
                    index === 0
                        ? placement
                        : { overId: ids[index - 1], side: 'after' },
                ),
            ordered,
        );
    const dropOf = (
        { active, over }: DragMoveEvent,
        pointer: { x: number; y: number } | null,
    ): ControlPlacement | null => {
        const layout =
            pointer === null || barRef.current === null
                ? null
                : measureBar(barRef.current);
        const placement =
            pointer === null
                ? placementOf(active, over)
                : layout === null || isOnNewSection(pointer, active)
                  ? null
                  : chooseInsertionPoint(
                        layout,
                        pointer,
                        active.data?.current?.kind === SECTION_DRAG,
                    );
        // Where it already is: no line, nothing written
        return placement !== null &&
            placeAll(movedIdsOf(String(active.id)), placement) !== ordered
            ? placement
            : null;
    };
    // The row of a capsule nearest `y` (its head, members or actions), from
    // inside its border; null for its first row
    const capsuleRowTopOf = (sectionId: string, y: number) => {
        const capsule = barRef.current?.querySelector(
            `[data-section-capsule="${sectionId}"]`,
        );
        if (capsule === null || capsule === undefined) return null;
        const outline = capsule.getBoundingClientRect();
        const row = [
            ...capsule.querySelectorAll(
                '[data-section-head], [data-section-end], [data-controls-pill], [data-parameter-pill], [data-date-zoom-pill]',
            ),
        ]
            .map((element) => element.getBoundingClientRect())
            .reduce<DOMRect | null>((best, rect) => {
                const off = (r: DOMRect) =>
                    Math.max(0, r.top - y, y - r.bottom);
                return best === null || off(rect) < off(best) ? rect : best;
            }, null);
        // 1px border, 3px padding: the first row needs no offset
        const top = row === null ? null : row.top - outline.top - 1;
        return top === null || top <= 3 ? null : top;
    };
    const handleDragMove = (event: DragMoveEvent) => {
        const pointer = pointerOf(event);
        const next = dropOf(event, pointer);
        const top =
            pointer !== null &&
            next !== null &&
            'overId' in next &&
            sections.some(({ id }) => id === next.overId)
                ? capsuleRowTopOf(next.overId, pointer.y)
                : null;
        setDrop((previous) => (isEqual(next, previous) ? previous : next));
        setDropTop(top);
    };
    // Each control at the placement, the rest of a selection right after it;
    // a section change writes the control's own section too
    const commitPlacement = (ids: string[], placement: ControlPlacement) => {
        const next = placeAll(ids, placement);
        if (next === ordered) return;
        if (ids.some((id) => selectedIds.includes(id))) clearSelection();
        let filters = dashboardFilters;
        next.forEach((now) => {
            const was = controlOf(now.id);
            if (was === undefined || was.sectionId === now.sectionId) return;
            if (was.kind === DashboardControlRefKind.PARAMETER)
                moveParameter(now.id, { sectionId: now.sectionId });
            if (was.kind === DashboardControlRefKind.DATE_ZOOM)
                setZoomSection(now.id, now.sectionId);
            if (was.kind === DashboardControlRefKind.FILTER)
                filters = moveRuleToSection(
                    filters,
                    now.id,
                    { sectionId: now.sectionId },
                    sections,
                );
        });
        if (filters !== dashboardFilters) {
            setDashboardFilters(filters);
            setHaveFiltersChanged(true);
            if (newFilterId === null || !ids.includes(newFilterId))
                trackMoved(
                    countSectionChanges(dashboardFilters, filters, sections),
                    'drag',
                );
        }
        arrange(next);
    };
    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        const pointer = pointerOf(event);
        setDraggedId(null);
        setDrop(null);
        setDropTop(null);
        pointerRef.current = null;
        const activeId = String(active.id);
        // A picked pill carries the selection, filters and parameters alike
        const isCarryingSelection =
            allSelected.length > 1 && allSelected.includes(activeId);
        // Onto the New section capsule: name it, then the pill (or the
        // selection it carries) moves in; no section starts during an edit
        if (
            pointer === null
                ? over !== null && String(over.id) === NEW_SECTION_TARGET_ID
                : isOnNewSection(pointer, active)
        ) {
            if (isEditing) return;
            setNaming({
                moveIds: isCarryingSelection ? allSelected : [activeId],
                source: 'new_section_drop',
            });
            return;
        }
        // By pointer or keyboard, it lands where its line showed
        const placement = dropOf(event, pointer);
        if (placement !== null)
            commitPlacement(movedIdsOf(activeId), placement);
    };
    const dragged = allRules.find(({ rule }) => rule.id === draggedId);
    const draggedSection = sections.find(({ id }) => id === draggedId);
    const draggedParameter = parameterEntries.find(
        ({ control }) => control.id === draggedId,
    );
    const draggedField = dragged ? fieldOf(dragged) : null;
    const draggedZoom = dateZoomEntries.find(
        ({ control }) => control.uuid === draggedId,
    );
    const barEnd = (
        <>
            {naming === null && isGhostShown && (
                <Box className={classes.line}>
                    <InertWhileEditing>
                        <NewSectionGhost
                            isDisabled={isEditing}
                            onClick={() =>
                                setNaming({
                                    moveIds: allSelected,
                                    source: 'new_section_capsule',
                                })
                            }
                        />
                    </InertWhileEditing>
                </Box>
            )}
            {newSection}
        </>
    );

    return (
        <BarSelectionContext.Provider value={selection}>
            <DndContext
                sensors={sensors}
                collisionDetection={(args) => {
                    pointerRef.current = args.pointerCoordinates;
                    return underPointerFor(args, sectionTargetIds);
                }}
                accessibility={{ announcements: getDragAnnouncements(nameOf) }}
                onDragStart={({ active }: DragStartEvent) =>
                    setDraggedId(String(active.id))
                }
                onDragMove={handleDragMove}
                onDragOver={handleDragMove}
                onDragEnd={handleDragEnd}
                onDragCancel={() => {
                    setDraggedId(null);
                    setDrop(null);
                    setDropTop(null);
                    pointerRef.current = null;
                }}
            >
                <BarMoveContext.Provider value={moveByKeyboard}>
                    <BarDropContext.Provider value={drop}>
                        <BarSpace
                            ref={barRef}
                            isSectioned={
                                sections.length > 0 ||
                                (hasStoredOrder && orderLines.length > 1)
                            }
                            hasEndGap={!hasStoredOrder && lines.length === 0}
                        >
                            {hasStoredOrder ? (
                                <>
                                    {renderOrderLines(
                                        <>
                                            {leading}
                                            <UnsectionTarget>
                                                <AddControl />
                                            </UnsectionTarget>
                                        </>,
                                        barEnd,
                                    )}
                                </>
                            ) : (
                                <>
                                    {/* No section line yet: the gap below the bar's one line, out of the layout */}
                                    {lines.length === 0 && (
                                        <LineGap
                                            lineStartId={null}
                                            isEnd
                                            isShown={isGapShown(null)}
                                        />
                                    )}
                                    {leading}
                                    <UnsectionTarget>
                                        <AddControl />
                                    </UnsectionTarget>
                                    {pills}
                                    {/* A first section is named inline, where its capsule lands */}
                                    <Box
                                        className={classes.sections}
                                        data-own-line={
                                            isSectionsOwnLine || undefined
                                        }
                                    >
                                        {lines.length === 0
                                            ? barEnd
                                            : renderSectionLines(barEnd)}
                                    </Box>
                                </>
                            )}
                        </BarSpace>
                    </BarDropContext.Provider>
                </BarMoveContext.Provider>
                <VisuallyHidden role="status" aria-live="polite">
                    <span key={moveStatus.key}>{moveStatus.text}</span>
                </VisuallyHidden>
                {/* On the body, so the bar's overflow doesn't clip the copy */}
                {createPortal(
                    <DragOverlay modifiers={OVERLAY_MODIFIERS}>
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
                        ) : draggedParameter ? (
                            <Group
                                gap="xs"
                                wrap="nowrap"
                                className={classes.dragPreview}
                            >
                                <MantineIcon
                                    icon={IconAdjustmentsHorizontal}
                                    size={14}
                                />
                                <Text fz="xs" fw={500} truncate>
                                    {getParameterEntryName(draggedParameter)}
                                </Text>
                            </Group>
                        ) : draggedZoom ? (
                            <Group
                                gap="xs"
                                wrap="nowrap"
                                className={classes.dragPreview}
                            >
                                <MantineIcon
                                    icon={IconCalendarSearch}
                                    size={14}
                                />
                                <Text fz="xs" fw={500} truncate>
                                    {draggedZoom.control.name}
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
                                    {formatPickedCount(
                                        selected.length,
                                        selectedParameterIds.length,
                                        selectedZoomIds.length,
                                    )}
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
                {allSelected.length > 0 && !isEditing && (
                    <SelectionBar
                        filterCount={selected.length}
                        parameterCount={selectedParameterIds.length}
                        dateZoomCount={selectedZoomIds.length}
                        sections={groupRulesBySection(
                            dashboardFilters,
                            sections,
                        ).flatMap(({ section, rules }) =>
                            section === null
                                ? []
                                : [
                                      {
                                          ...section,
                                          count:
                                              rules.length +
                                              parameterCountOf(section.id) +
                                              dateZoomCountOf(section.id),
                                      },
                                  ],
                        )}
                        sharedSectionId={
                            selectedSectionIds.length === 1
                                ? selectedSectionIds[0]
                                : null
                        }
                        isAnyInSection={selectedSectionIds.some(
                            (id) => id !== null,
                        )}
                        onMove={(sectionId) =>
                            moveSelected(sectionId, 'selection_bar')
                        }
                        onMoveToNewSection={(source) =>
                            setNaming({ moveIds: allSelected, source })
                        }
                        onRemove={removeSelected}
                        onClear={clearSelection}
                    />
                )}
            </DndContext>
        </BarSelectionContext.Provider>
    );
};
