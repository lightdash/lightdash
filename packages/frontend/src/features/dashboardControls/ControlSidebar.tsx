import {
    closestCenter,
    DndContext,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
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
    useDashboardDispatch,
    useDashboardSelector,
    useDashboardTemporaryFilters,
} from '../dashboard/store';
import { useIsLockedDashboardFilterRule } from '../dashboardFilters/useIsLockedDashboardFilterRule';
import classes from './ControlSidebar.module.css';
import { EditorShell } from './EditorShell';
import { FieldsAndTiles } from './FieldsAndTiles';
import { FilterRow, FilterTypeIcon } from './FilterRow';
import { FilterSettings } from './FilterSettings';
import { getFilterFields } from './peers';
import { getTilesSummary } from './railSummaries';
import { SectionDropZone, SectionHeader } from './SectionHeader';

const NEW_SECTION_BUTTON = '[data-controls-new-section]';
const sectionMenuSelector = (sectionId: string) =>
    `[data-controls-section="${sectionId}"] [data-controls-section-menu]`;
import {
    getSectionCountLabel,
    groupRulesBySection,
    moveRuleToSection,
    removeSectionFromRules,
    getDragAnnouncements,
    sectionOfZoneId,
    sectionZoneId,
    UNSECTIONED_ZONE_ID,
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

export const ControlSidebar: FC = () => {
    const filterId = useControlsSidebarSelector(
        (c) => c.editing?.filterId ?? null,
    );
    const editingRule = useControlsSidebarSelector((c) => c.editingRule);
    const isPlaceholder = useControlsSidebarSelector((c) => c.isPlaceholder);
    const isRailOpen = useControlsSidebarSelector((c) => c.isRailOpen);
    const isSidebarOpen = useControlsSidebarSelector((c) => c.isSidebarOpen);
    const open = useControlsSidebarSelector((c) => c.open);
    const setHoveredFilterId = useControlsSidebarSelector(
        (c) => c.setHoveredFilterId,
    );
    const clearHoveredFilterId = useControlsSidebarSelector(
        (c) => c.clearHoveredFilterId,
    );
    const close = useControlsSidebarSelector((c) => c.close);
    const discard = useControlsSidebarSelector((c) => c.discard);
    const isViewer = useControlsSidebarSelector((c) => c.isViewer);
    const getUiString = useUiStrings();
    const dispatch = useDashboardDispatch();
    const setDashboardFilters = useDashboardContext(
        (c) => c.setDashboardFilters,
    );
    const setHaveFiltersChanged = useDashboardContext(
        (c) => c.setHaveFiltersChanged,
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
    if (!isRailOpen) return null;
    const sections = nameEdit?.isNew
        ? [...controlSections, { id: nameEdit.id, name: '' }]
        : controlSections;
    // A viewer's rail lists only their own filters: saved ones stay on the
    // bar, and sections are the editor's
    const listedFilters = isViewer ? temporaryFilters : dashboardFilters;
    const grouped = groupRulesBySection(
        listedFilters,
        isViewer ? [] : sections,
    );
    const sectionIds = new Set(controlSections.map((section) => section.id));
    const sectionNames = new Map(
        sections.map((section) => [
            section.id,
            section.name || 'Untitled section',
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
        if (id === UNSECTIONED_ZONE_ID) return 'the space outside any section';
        const zoneSectionId = sectionOfZoneId(id);
        if (zoneSectionId !== null)
            return `the empty section ${sectionNames.get(zoneSectionId) ?? ''}`;
        const sectionName = sectionNames.get(id);
        if (sectionName !== undefined) return `section ${sectionName}`;
        return ruleNames.get(id) ?? 'a filter';
    };
    const sectionOfRule = (ruleId: string) =>
        grouped.find(({ rules }) =>
            rules.some(({ rule }) => rule.id === ruleId),
        )?.section?.id ?? null;

    const handleDragEnd = ({ active, over }: DragEndEvent) => {
        if (!over || active.id === over.id) return;
        const activeId = String(active.id);
        const overId = String(over.id);
        const zoneSectionId = sectionOfZoneId(overId);
        // Over a header, its empty zone or one of its rows: that section
        const overSectionId = sectionIds.has(overId)
            ? overId
            : (zoneSectionId ?? sectionOfRule(overId));
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
            overId === UNSECTIONED_ZONE_ID
                ? { sectionId: null }
                : sectionIds.has(overId) || zoneSectionId !== null
                  ? { sectionId: overSectionId }
                  : { ruleId: overId };
        const moved = moveRuleToSection(dashboardFilters, activeId, target);
        if (moved === dashboardFilters) return;
        setDashboardFilters(moved);
        setHaveFiltersChanged(true);
    };

    const removeSection = (sectionId: string, hasMembers: boolean) => {
        focusAfter.current = NEW_SECTION_BUTTON;
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
    const renderRow = ({ rule, group }: SectionRule) => {
        if (rule.id === filterId) return editor;
        const field =
            getDashboardFilterField<DashboardFilterableField>(
                group === 'metrics'
                    ? allFilterableMetricsMap
                    : allFilterableFieldsMap,
                rule,
                filterableFieldsByTileUuid,
            ) ?? null;
        const isUnresolved =
            field === null &&
            !rule.target.isSqlColumn &&
            !isPlaceholderRule(rule) &&
            !areFieldsLoading;
        return (
            <SortableRow
                key={rule.id}
                id={rule.id}
                isDisabled={isSidebarOpen || isViewer}
            >
                <FilterRow
                    rule={rule}
                    field={field}
                    activeTabUuid={activeTabUuid}
                    hasTabs={hasTabs}
                    isOwn={isViewer}
                    isReadOnly={isUnresolved}
                    readOnlyTooltip={
                        isUnresolved ? getUnresolvedTooltip(rule) : null
                    }
                    isDisabled={!areFieldsLoaded && !rule.target.isSqlColumn}
                    onOpen={open}
                    onHover={setHoveredFilterId}
                    onUnhover={clearHoveredFilterId}
                />
            </SortableRow>
        );
    };
    // A placeholder is not in the dashboard filters yet: it comes last among
    // the unsectioned rows. One keyed list, so the editor keeps its state
    // when its rule joins them
    const isListed =
        editor === null ||
        grouped.some(({ rules }) =>
            rules.some(({ rule }) => rule.id === filterId),
        );
    // A filter in a section: a zone under the unsectioned rows to take it out
    const hasUnsectionedZone = grouped.some(
        ({ section, rules }) => section !== null && rules.length > 0,
    );
    const sortableIds = grouped.flatMap(({ section, rules }) => [
        ...(section === null ? [] : [section.id]),
        ...rules.map(({ rule }) => rule.id),
        ...(section === null && hasUnsectionedZone
            ? [UNSECTIONED_ZONE_ID]
            : []),
        ...(section !== null && rules.length === 0
            ? [sectionZoneId(section.id)]
            : []),
    ]);
    const body = grouped.flatMap(({ section, rules }) => {
        if (section === null) {
            const rows = rules.map(renderRow);
            const zone = hasUnsectionedZone
                ? [
                      <SectionDropZone
                          key={UNSECTIONED_ZONE_ID}
                          id={UNSECTIONED_ZONE_ID}
                          label="Drag a filter here to take it out of its section"
                          isDisabled={isSidebarOpen}
                      />,
                  ]
                : [];
            return isListed ? [...rows, ...zone] : [...rows, editor, ...zone];
        }
        const isCollapsed = collapsedIds.includes(section.id);
        // A collapsed section still shows the filter being edited
        const shown = isCollapsed
            ? rules.filter(({ rule }) => rule.id === filterId)
            : rules;
        return [
            <SectionHeader
                key={`section:${section.id}`}
                section={section}
                countLabel={getSectionCountLabel(rules.length)}
                isCollapsed={isCollapsed}
                isEditingName={nameEdit?.id === section.id}
                isDragDisabled={isSidebarOpen || nameEdit !== null}
                onToggle={() =>
                    setCollapsedIds((ids) =>
                        ids.includes(section.id)
                            ? ids.filter((id) => id !== section.id)
                            : [...ids, section.id],
                    )
                }
                onRename={() => setNameEdit({ id: section.id, isNew: false })}
                onCommitName={commitName}
                onCancelName={cancelName}
                onRemove={() => removeSection(section.id, rules.length > 0)}
            />,
            ...shown.map(renderRow),
            ...(rules.length === 0 && !isCollapsed
                ? [
                      <SectionDropZone
                          key={sectionZoneId(section.id)}
                          id={sectionZoneId(section.id)}
                          label="Drag filters here"
                          isDisabled={isSidebarOpen}
                      />,
                  ]
                : []),
        ];
    });
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
        <EditorShell
            filterCount={
                listedFilters.dimensions.length + listedFilters.metrics.length
            }
            onClose={close}
            onCancel={editor !== null && isPlaceholder ? discard : null}
            onNewSection={
                isViewer
                    ? null
                    : () => {
                          if (nameEdit?.isNew) return;
                          setNameEdit({ id: uuidv4(), isNew: true });
                      }
            }
            footerStatus={footerStatus}
        >
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                accessibility={{
                    announcements: getDragAnnouncements(nameOf),
                }}
                onDragEnd={handleDragEnd}
            >
                <SortableContext
                    items={sortableIds}
                    strategy={verticalListSortingStrategy}
                >
                    {body}
                </SortableContext>
            </DndContext>
        </EditorShell>
    );
};
