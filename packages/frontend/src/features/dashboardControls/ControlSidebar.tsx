import {
    closestCenter,
    DndContext,
    pointerWithin,
    type CollisionDetection,
    DragOverlay,
    KeyboardSensor,
    MeasuringStrategy,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragOverEvent,
    type DragStartEvent,
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    type SortingStrategy,
} from '@dnd-kit/sortable';
import {
    getDashboardFilterField,
    interpolateUiString,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Group,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import {
    IconArrowBackUp,
    IconChevronDown,
    IconTrash,
} from '@tabler/icons-react';
import {
    useCallback,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ConfirmDeleteButton } from '../../components/common/ConfirmDeleteButton';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    dashboardEditActions,
    selectActiveTabUuid,
    selectControlSections,
    selectDashboardFilters,
    selectDashboardTabs,
    selectDashboardTiles,
    selectIsAddFilterDisabled,
    useDashboardDispatch,
    useDashboardSelector,
    useDashboardTemporaryFilters,
} from '../dashboard/store';
import { useIsLockedDashboardFilterRule } from '../dashboardFilters/useIsLockedDashboardFilterRule';
import classes from './ControlSidebar.module.css';
import { EditorShell } from './EditorShell';
import { formatSectionCount } from './fieldLabels';
import { FieldsAndTiles } from './FieldsAndTiles';
import { FilterRow, FilterTypeIcon } from './FilterRow';
import { FilterSettings } from './FilterSettings';
import { getFilterFields } from './peers';
import { getTilesSummary } from './railSummaries';
import { SectionHeader } from './SectionHeader';

const NEW_SECTION_BUTTON = '[data-controls-new-section]';
// The target is what is under the pointer; the keyboard sensor has none,
// so it falls back to the nearest centre
const underPointer: CollisionDetection = (args) => {
    const within = pointerWithin(args);
    return within.length > 0 ? within : closestCenter(args);
};
// Nothing moves until the drop: the overlay and `data-over` are the feedback
const noDisplacement: SortingStrategy = () => null;
const sectionMenuSelector = (sectionId: string) =>
    `[data-controls-section="${sectionId}"] [data-controls-section-menu]`;
import {
    groupRulesBySection,
    moveRuleToSection,
    removeSectionFromRules,
    getDragAnnouncements,
    UNSECTIONED_TARGET_ID,
    type SectionRule,
} from './sections';
import {
    isDefaultValueIncomplete,
    isPlaceholderRule,
    withFilterRuleLabel,
} from './sidebarState';
import { SortableRow } from './SortableRow';
import { useAppliedTileCount } from './useAppliedTileCount';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { useFilterRuleField } from './useFilterRuleField';
import { useFocusLabelOnMount, useLabelDraft } from './useLabelDraft';

type FilterEditorProps = {
    rule: DashboardFilterRule;
};

// Mounted with the filter id as key, so the label draft and the armed state
// never carry over to another control, and the label takes focus each time
const FilterEditor: FC<FilterEditorProps> = ({ rule: filterRule }) => {
    const isNew = useControlsSidebarSelector((c) => c.isNew);
    const emptiedFieldLabel = useControlsSidebarSelector(
        (c) => c.emptiedFieldLabel,
    );
    const isPlaceholder = useControlsSidebarSelector((c) => c.isPlaceholder);
    const removeFilter = useControlsSidebarSelector((c) => c.removeFilter);
    const updateFilter = useControlsSidebarSelector((c) => c.updateFilter);
    const discard = useControlsSidebarSelector((c) => c.discard);
    const collapse = useControlsSidebarSelector((c) => c.collapse);
    const isDirty = useControlsSidebarSelector((c) => c.isDirty);
    const isViewer = useControlsSidebarSelector((c) => c.isViewer);
    const getUiString = useUiStrings();
    useFocusLabelOnMount();
    // The name takes focus as the edit-mode label input does (`autoFocus`).
    // A new filter has no name to edit: once a field is picked, the value
    // does, which mounts in the same commit
    const [isOpenedNew] = useState(() => isPlaceholder);
    const focusOnMount = useCallback(
        (node: HTMLElement | null) => {
            if (node === null) return;
            if (!isOpenedNew) {
                node.focus();
                return;
            }
            node.closest('[data-controls-editor]')
                ?.querySelector<HTMLElement>(
                    '[data-controls-value] input:not([type="hidden"])',
                )
                ?.focus();
        },
        [isOpenedNew],
    );
    // As the control was opened: an emptied label goes back to exactly that
    const [hadLabelKey] = useState(() => 'label' in filterRule);
    const label = useLabelDraft(filterRule.label ?? '', (next) =>
        updateFilter(withFilterRuleLabel(filterRule, next, hadLabelKey)),
    );
    const dashboardTiles = useDashboardSelector(selectDashboardTiles);
    const appliedTileCount = useAppliedTileCount(filterRule);
    // No props, so one element: typing a label does not re-render the list
    const fieldsAndTiles = useMemo(() => <FieldsAndTiles />, []);

    // A dimension or a metric, as the shipped bar resolves it
    const field = useFilterRuleField(filterRule);
    // What the bar shows for a filter with no label: its field's name, or
    // the column's for a SQL column filter
    const fallbackName =
        field?.label ??
        (filterRule.target.isSqlColumn ? filterRule.target.fieldId : null);
    const discardLabel = isNew
        ? getUiString('filters.rail.discardFilter')
        : isDirty
          ? getUiString('filters.rail.discardChanges')
          : null;
    const fieldCount = getFilterFields(filterRule, dashboardTiles).length;
    // A new filter with no field yet leaves through the footer's Cancel
    const hasDiscard = !(isPlaceholder && isNew) && discardLabel !== null;
    // A viewer's filter has no label of its own: it goes by its field
    const viewerName = isPlaceholder
        ? (emptiedFieldLabel ?? getUiString('filters.rail.filterName'))
        : (filterRule.label ??
          fallbackName ??
          getUiString('filters.rail.filterName'));
    return (
        <Box className={classes.edited}>
            {/* A click on the head collapses the filter, as its chevron does;
                the name input and the buttons keep their own clicks */}
            <Group
                gap="xs"
                wrap="nowrap"
                className={classes.editedHead}
                onClick={(event) => {
                    if (
                        event.target instanceof Element &&
                        event.target.closest('input, button')
                    )
                        return;
                    collapse();
                }}
            >
                {/* No field yet: no type to show */}
                {!isPlaceholder && <FilterTypeIcon field={field} />}
                {isPlaceholder && isNew ? (
                    <Text fz="sm" fw={600} flex={1}>
                        {getUiString('filters.rail.newFilter')}
                    </Text>
                ) : isViewer ? (
                    // Focus lands here when the filter opens
                    <Text
                        fz="sm"
                        fw={600}
                        flex={1}
                        truncate
                        tabIndex={-1}
                        ref={focusOnMount}
                        data-controls-label
                    >
                        {viewerName}
                    </Text>
                ) : (
                    <TextInput
                        aria-label="Filter label"
                        size="xs"
                        className={classes.nameInput}
                        classNames={{ input: classes.nameInputField }}
                        // Left empty, the filter goes by its field's name.
                        // An existing control that lost its last field keeps it
                        placeholder={
                            fallbackName ?? emptiedFieldLabel ?? 'Filter name'
                        }
                        autoFocus
                        data-controls-label
                        value={label.draft}
                        onChange={(event) =>
                            label.type(event.currentTarget.value)
                        }
                        // Synchronous, so a click on Done closes with the label
                        onBlur={label.flush}
                        onKeyDown={(event) => {
                            if (event.key !== 'Enter') return;
                            event.preventDefault();
                            label.flush();
                        }}
                    />
                )}
                {hasDiscard && (
                    <Tooltip label={discardLabel}>
                        <ActionIcon
                            size="sm"
                            variant="subtle"
                            aria-label={discardLabel}
                            onClick={discard}
                        >
                            <MantineIcon icon={IconArrowBackUp} />
                        </ActionIcon>
                    </Tooltip>
                )}
                {!isNew && (
                    <ConfirmDeleteButton
                        size="sm"
                        aria-label={getUiString('filters.rail.removeFilter')}
                        tooltip={getUiString('filters.rail.confirmRemove')}
                        data-own-escape
                        onConfirm={removeFilter}
                    >
                        <MantineIcon icon={IconTrash} />
                    </ConfirmDeleteButton>
                )}
                <Tooltip label={getUiString('filters.rail.collapse')}>
                    <ActionIcon
                        size="sm"
                        variant="subtle"
                        aria-label={getUiString('filters.rail.collapseFilter')}
                        aria-expanded
                        onClick={collapse}
                    >
                        <MantineIcon icon={IconChevronDown} size={14} />
                    </ActionIcon>
                </Tooltip>
            </Group>
            <Box className={classes.editedBody}>
                {isPlaceholder ? (
                    fieldsAndTiles
                ) : (
                    <FilterSettings
                        rule={filterRule}
                        field={field}
                        onChange={updateFilter}
                        tiles={fieldsAndTiles}
                        tilesSummary={getTilesSummary(
                            appliedTileCount,
                            fieldCount,
                            getUiString,
                        )}
                    />
                )}
            </Box>
        </Box>
    );
};

/** For the dashboard grid's row, which holds the rail next to the grid. */
export const CONTROLS_RAIL_LAYOUT = classes.layout;

type NameEdit = { id: string; isNew: boolean };

// Mounted only while the rail is open, so `nameEdit`, the fold state and the
// drag reset with it
export const ControlSidebar: FC = () => {
    const isRailOpen = useControlsSidebarSelector((c) => c.isRailOpen);
    return isRailOpen ? <OpenControlSidebar /> : null;
};

const OpenControlSidebar: FC = () => {
    const filterId = useControlsSidebarSelector(
        (c) => c.editing?.filterId ?? null,
    );
    const editingRule = useControlsSidebarSelector((c) => c.editingRule);
    const isPlaceholder = useControlsSidebarSelector((c) => c.isPlaceholder);
    const open = useControlsSidebarSelector((c) => c.open);
    const setHoveredFilterId = useControlsSidebarSelector(
        (c) => c.setHoveredFilterId,
    );
    const clearHoveredFilterId = useControlsSidebarSelector(
        (c) => c.clearHoveredFilterId,
    );
    const close = useControlsSidebarSelector((c) => c.close);
    const collapse = useControlsSidebarSelector((c) => c.collapse);
    const discard = useControlsSidebarSelector((c) => c.discard);
    const openNew = useControlsSidebarSelector((c) => c.openNew);
    const removeFilterById = useControlsSidebarSelector(
        (c) => c.removeFilterById,
    );
    const canAddFilters = useControlsSidebarSelector((c) => c.canAddFilters);
    const isViewer = useControlsSidebarSelector((c) => c.isViewer);
    // Hidden from viewers by the editor's eye
    const isAddFilterDisabled = useDashboardSelector(selectIsAddFilterDisabled);
    const getUiString = useUiStrings();
    const dispatch = useDashboardDispatch();
    const setDashboardFilters = useDashboardContext(
        (c) => c.setDashboardFilters,
    );
    const setHaveFiltersChanged = useDashboardContext(
        (c) => c.setHaveFiltersChanged,
    );
    const setIsAddFilterDisabled = useDashboardContext(
        (c) => c.setIsAddFilterDisabled,
    );
    const dashboardFilters = useDashboardSelector(selectDashboardFilters);
    const temporaryFilters = useDashboardTemporaryFilters();
    const controlSections = useDashboardSelector(selectControlSections);
    const activeTabUuid = useDashboardSelector(selectActiveTabUuid);
    const hasTabs = useDashboardSelector(
        (state) => selectDashboardTabs(state).length > 0,
    );
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    // While fields load nothing resolves, which is not the same as invalid
    const areFieldsLoading = useDashboardContext(
        (c) => c.isLoadingDashboardFilters || c.isFetchingDashboardFilters,
    );
    // As the shipped pill: no editor until the fields exist
    const areFieldsLoaded = useDashboardContext(
        (c) => c.allFilterableFields !== undefined,
    );
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );
    const allFilterableMetricsMap = useDashboardContext(
        (c) => c.allFilterableMetricsMap,
    );
    const isLockedRule = useIsLockedDashboardFilterRule();

    // The shipped unresolved pills' tooltips: a hidden field, or a gone one
    const getUnresolvedTooltip = (rule: DashboardFilterRule) =>
        isLockedRule(rule)
            ? getUiString('filters.lockedFilterTooltip')
            : interpolateUiString(getUiString('filters.rail.unknownField'), {
                  field: rule.target.fieldId,
              });
    // Local to this mount: nothing saved
    const [collapsedIds, setCollapsedIds] = useState<string[]>([]);
    // A new section lives only here until its name is committed
    const [nameEdit, setNameEdit] = useState<NameEdit | null>(null);
    // The row or header under the pointer, copied into the drag overlay
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );
    // The menu and the name input unmount with focus on them: it goes to the
    // section's menu button, or the footer once the section is gone
    const focusAfter = useRef<string | null>(null);
    useLayoutEffect(() => {
        if (focusAfter.current === null) return;
        document.querySelector<HTMLElement>(focusAfter.current)?.focus();
        focusAfter.current = null;
    });
    const sections = nameEdit?.isNew
        ? [...controlSections, { id: nameEdit.id, name: '' }]
        : controlSections;
    // A viewer's rail lists their own filters first, then the saved
    // sections read-only; a saved filter with no section stays on the bar
    const listedFilters = isViewer ? temporaryFilters : dashboardFilters;
    const grouped = isViewer
        ? [
              ...groupRulesBySection(temporaryFilters, []),
              ...groupRulesBySection(dashboardFilters, sections).filter(
                  ({ section, rules }) => section !== null && rules.length > 0,
              ),
          ]
        : groupRulesBySection(dashboardFilters, sections);
    const sectionIds = new Set(controlSections.map((section) => section.id));
    const sectionNames = new Map(
        sections.map((section) => [
            section.id,
            section.name || getUiString('filters.rail.untitledSection'),
        ]),
    );
    const ruleNames = new Map(
        grouped.flatMap(({ rules }) =>
            rules.map(({ rule, group }): [string, string] => [
                rule.id,
                rule.label ||
                    getDashboardFilterField<DashboardFilterableField>(
                        group === 'metrics'
                            ? allFilterableMetricsMap
                            : allFilterableFieldsMap,
                        rule,
                        filterableFieldsByTileUuid,
                    )?.label ||
                    rule.target.fieldId,
            ]),
        ),
    );
    const nameOf = (id: string) => {
        if (id === UNSECTIONED_TARGET_ID)
            return 'the space outside any section';
        const sectionName = sectionNames.get(id);
        if (sectionName !== undefined) return `section ${sectionName}`;
        return ruleNames.get(id) ?? 'a filter';
    };
    const sectionOfRule = (ruleId: string) =>
        grouped.find(({ rules }) =>
            rules.some(({ rule }) => rule.id === ruleId),
        )?.section?.id ?? null;
    const fieldOf = ({ rule, group }: SectionRule) =>
        getDashboardFilterField<DashboardFilterableField>(
            group === 'metrics'
                ? allFilterableMetricsMap
                : allFilterableFieldsMap,
            rule,
            filterableFieldsByTileUuid,
        ) ?? null;

    const handleDragStart = ({ active }: DragStartEvent) =>
        setDraggedId(String(active.id));
    // A collapsed section opens under the drag, so its rows become targets
    const handleDragOver = ({ active, over }: DragOverEvent) => {
        // A dragged header starts over itself
        if (!over || sectionIds.has(String(active.id))) return;
        const overId = String(over.id);
        if (!collapsedIds.includes(overId)) return;
        setCollapsedIds((ids) => ids.filter((id) => id !== overId));
    };
    const handleDragEnd = ({ active, over }: DragEndEvent) => {
        setDraggedId(null);
        if (!over || active.id === over.id) return;
        const activeId = String(active.id);
        const overId = String(over.id);
        // Over a header or one of its rows: that section
        const overSectionId = sectionIds.has(overId)
            ? overId
            : sectionOfRule(overId);
        if (sectionIds.has(activeId)) {
            if (overSectionId === null || overSectionId === activeId) return;
            dispatch(
                dashboardEditActions.moveControlSection({
                    id: activeId,
                    overId: overSectionId,
                }),
            );
            return;
        }
        const target =
            overId === UNSECTIONED_TARGET_ID
                ? { sectionId: null }
                : sectionIds.has(overId)
                  ? { sectionId: overId }
                  : { ruleId: overId };
        const moved = moveRuleToSection(dashboardFilters, activeId, target);
        if (moved === dashboardFilters) return;
        setDashboardFilters(moved);
        setHaveFiltersChanged(true);
    };

    const removeSection = (
        sectionId: string,
        hasMembers: boolean,
        holdsEditor: boolean,
    ) => {
        // The menu button is going away: focus goes to the expanded filter's
        // label when the section held it, else to the header's "Add"
        focusAfter.current = holdsEditor
            ? '[data-controls-label]'
            : NEW_SECTION_BUTTON;
        dispatch(dashboardEditActions.removeControlSection(sectionId));
        if (!hasMembers) return;
        setDashboardFilters((filters) =>
            removeSectionFromRules(filters, sectionId),
        );
        setHaveFiltersChanged(true);
    };

    const commitName = (name: string) => {
        if (nameEdit === null) return;
        focusAfter.current = sectionMenuSelector(nameEdit.id);
        dispatch(
            nameEdit.isNew
                ? dashboardEditActions.addControlSection({
                      id: nameEdit.id,
                      name,
                  })
                : dashboardEditActions.renameControlSection({
                      id: nameEdit.id,
                      name,
                  }),
        );
        setNameEdit(null);
    };
    const cancelName = () => {
        if (nameEdit === null) return;
        focusAfter.current = nameEdit.isNew
            ? NEW_SECTION_BUTTON
            : sectionMenuSelector(nameEdit.id);
        setNameEdit(null);
    };

    // Null while every filter is a row
    const editor =
        filterId === null || editingRule === null ? null : (
            <FilterEditor key={filterId} rule={editingRule} />
        );
    // Drag is off only while a section is being named
    const isDragDisabled = nameEdit !== null;
    // The pill's X and the rail's row remove take the same path. Focus goes
    // to the next row on screen, else the one before, else the header's
    // "Add"; the expanded filter takes it on its label
    const removeRow = (ruleId: string) => {
        const rowIds = listed.flatMap(({ shown }) =>
            shown.map(({ rule }) => rule.id),
        );
        const index = rowIds.indexOf(ruleId);
        const nextId = rowIds[index + 1] ?? rowIds[index - 1];
        focusAfter.current =
            nextId === undefined
                ? NEW_SECTION_BUTTON
                : nextId === filterId
                  ? '[data-controls-label]'
                  : `[data-controls-row="${nextId}"]`;
        removeFilterById(ruleId);
    };
    // A viewer's saved row (in a section) opens nothing and has no grip
    const renderRow = (
        sectionRule: SectionRule,
        isSaved: boolean,
        isInSection: boolean,
    ) => {
        const { rule } = sectionRule;
        // The expanded filter drags as a row; its head has its own remove
        if (rule.id === filterId)
            return (
                <SortableRow
                    key={rule.id}
                    id={rule.id}
                    isDisabled={isDragDisabled || isViewer}
                    isInSection={isInSection}
                    isExpanded
                    onRemove={null}
                >
                    {editor}
                </SortableRow>
            );
        const field = fieldOf(sectionRule);
        const isUnresolved =
            field === null &&
            !rule.target.isSqlColumn &&
            !isPlaceholderRule(rule) &&
            !areFieldsLoading;
        const row = (
            <FilterRow
                key={rule.id}
                rule={rule}
                field={field}
                activeTabUuid={activeTabUuid}
                hasTabs={hasTabs}
                isOwn={isViewer && !isSaved}
                isReadOnly={isUnresolved || isSaved}
                readOnlyTooltip={
                    isUnresolved
                        ? getUnresolvedTooltip(rule)
                        : isSaved
                          ? getUiString('filters.rail.savedFilterReadOnly')
                          : null
                }
                isDisabled={!areFieldsLoaded && !rule.target.isSqlColumn}
                onOpen={open}
                onHover={setHoveredFilterId}
                onUnhover={clearHoveredFilterId}
            />
        );
        if (isSaved)
            return (
                <Box key={rule.id} className={classes.sectionRow}>
                    {row}
                </Box>
            );
        return (
            <SortableRow
                key={rule.id}
                id={rule.id}
                isDisabled={isDragDisabled || isViewer}
                isInSection={isInSection}
                isExpanded={false}
                onRemove={isViewer ? null : () => removeRow(rule.id)}
            >
                {row}
            </SortableRow>
        );
    };
    // A placeholder is not in the dashboard filters yet: it comes last in its
    // section, or among the unsectioned rows
    const isListed =
        editor === null ||
        grouped.some(({ rules }) =>
            rules.some(({ rule }) => rule.id === filterId),
        );
    const editorSectionId =
        !isListed &&
        editingRule?.sectionId !== undefined &&
        sectionIds.has(editingRule.sectionId)
            ? editingRule.sectionId
            : null;
    const unlistedEditor = (sectionId: string | null) =>
        isListed || editorSectionId !== sectionId
            ? []
            : sectionId === null
              ? [editor]
              : [
                    <Box
                        key={`placeholder:${filterId}`}
                        className={classes.sectionRow}
                    >
                        {editor}
                    </Box>,
                ];
    // What is on screen: the sortable ids must not name an unrendered row
    const listed = grouped.map(({ section, rules }) => {
        const isCollapsed =
            section !== null && collapsedIds.includes(section.id);
        return {
            section,
            rules,
            isCollapsed,
            shown: isCollapsed ? [] : rules,
        };
    });
    const sortableIds = listed.flatMap(({ section, shown }) => [
        ...(section === null ? [] : [section.id]),
        ...shown.map(({ rule }) => rule.id),
    ]);
    const body = listed.flatMap(({ section, rules, isCollapsed, shown }) => {
        if (section === null)
            return [
                ...shown.map((rule) => renderRow(rule, false, false)),
                ...unlistedEditor(null),
            ];
        // Folding a section folds the filter expanded in it first
        const holdsEditor =
            editorSectionId === section.id ||
            rules.some(({ rule }) => rule.id === filterId);
        return [
            <SectionHeader
                key={`section:${section.id}`}
                section={section}
                countLabel={formatSectionCount(getUiString, rules.length)}
                isCollapsed={isCollapsed}
                isEditingName={nameEdit?.id === section.id}
                isNew={nameEdit?.id === section.id && nameEdit.isNew}
                isDragDisabled={isDragDisabled}
                isReadOnly={isViewer}
                onToggle={() => {
                    if (!isCollapsed && holdsEditor) collapse();
                    setCollapsedIds((ids) =>
                        ids.includes(section.id)
                            ? ids.filter((id) => id !== section.id)
                            : [...ids, section.id],
                    );
                }}
                onRename={() => setNameEdit({ id: section.id, isNew: false })}
                onAddFilter={() => openNew(section.id)}
                onCommitName={commitName}
                onCancelName={cancelName}
                onRemove={() =>
                    removeSection(section.id, rules.length > 0, holdsEditor)
                }
            />,
            ...shown.map((rule) => renderRow(rule, isViewer, true)),
            ...(isCollapsed ? [] : unlistedEditor(section.id)),
        ];
    });
    // A compact copy under the pointer; the source row stays in place, dimmed
    const dragged =
        draggedId === null
            ? null
            : grouped
                  .flatMap(({ rules }) => rules)
                  .find(({ rule }) => rule.id === draggedId);
    const dragPreview =
        draggedId === null ? null : (
            <Group gap="xs" wrap="nowrap" className={classes.dragPreview}>
                {dragged && <FilterTypeIcon field={fieldOf(dragged)} />}
                <Text fz="sm" fw={dragged ? undefined : 600} truncate>
                    {sectionNames.get(draggedId) ?? nameOf(draggedId)}
                </Text>
            </Group>
        );
    // Closing keeps the edits, so the footer says what closing would drop
    const footerStatus =
        editingRule === null || editor === null
            ? null
            : isPlaceholder
              ? getUiString('filters.rail.selectFieldToKeep')
              : !isViewer && isDefaultValueIncomplete(editingRule)
                ? 'No default value set, so the default stays off'
                : null;

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={underPointer}
            accessibility={{
                announcements: getDragAnnouncements(nameOf),
            }}
            // A collapsed section opens mid-drag, so its rows are measured
            measuring={{
                droppable: { strategy: MeasuringStrategy.Always },
            }}
            autoScroll={{ layoutShiftCompensation: false }}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setDraggedId(null)}
        >
            <EditorShell
                filterCount={
                    listedFilters.dimensions.length +
                    listedFilters.metrics.length
                }
                onClose={close}
                // Dropping a header on the rail's header moves nothing
                isUnsectionTargetDisabled={
                    draggedId !== null && sectionIds.has(draggedId)
                }
                isDragging={draggedId !== null}
                onCancel={editor !== null && isPlaceholder ? discard : null}
                onAddFilter={
                    canAddFilters && !(isViewer && isAddFilterDisabled)
                        ? () => openNew()
                        : null
                }
                onNewSection={
                    isViewer
                        ? null
                        : () => {
                              if (nameEdit?.isNew) return;
                              // As `openNew`: the expanded filter folds first,
                              // but a new one with no field yet stays as it is
                              if (!isPlaceholder) collapse();
                              setNameEdit({ id: uuidv4(), isNew: true });
                          }
                }
                footerStatus={footerStatus}
                // The saved flag stays "disabled"; the switch reads positively
                viewerAdd={
                    isViewer
                        ? null
                        : {
                              isEnabled: !isAddFilterDisabled,
                              onChange: (isEnabled) =>
                                  setIsAddFilterDisabled(!isEnabled),
                          }
                }
            >
                <SortableContext items={sortableIds} strategy={noDisplacement}>
                    {body}
                </SortableContext>
                <DragOverlay>{dragPreview}</DragOverlay>
            </EditorShell>
        </DndContext>
    );
};
