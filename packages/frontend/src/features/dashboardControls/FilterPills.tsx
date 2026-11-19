import {
    DndContext,
    DragOverlay,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import {
    getDashboardFilterField,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import { Fragment, useMemo, type FC } from 'react';
import { DroppableArea } from '../../components/common/DndHelpers';
import { useStableCallback } from '../../hooks/useStableCallback';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    selectControlSections,
    selectDashboardFilters,
    selectDashboardTabs,
    useDashboardSelector,
    useDashboardTemporaryFilters,
} from '../dashboard/store';
import { moveFilterRule } from '../dashboardFilters/ActiveFilters/filterOrder';
import { FilterPillSkeletons } from '../dashboardFilters/ActiveFilters/FilterPillSkeletons';
import { UnresolvedFilter } from '../dashboardFilters/ActiveFilters/UnresolvedFilter';
import {
    isFilterHiddenOnTab,
    useFilterTabPlacement,
} from '../dashboardFilters/ActiveFilters/useFilterTabPlacement';
import { isPlaceholderRule } from './editorState';
import { FilterPill, type FilterPillKind } from './FilterPill';
import { BarDroppable, PillDraggable } from './PillDraggable';
import { isRuleInSection } from './sections';
import { TemporaryFilterPills } from './TemporaryFilterPills';
import { useControlsEditorSelector } from './useControlsEditor';

type Props = {
    activeTabUuid: string | undefined;
    /**
     * `undefined` (default): every saved rule and the viewer's own, dragged
     * in this component's own contexts; `null`: the unsectioned saved rules
     * and the viewer's own; a string: that section's saved rules alone. A
     * `null` or string pass drags in the bar's one context (`SectionedFilters`).
     */
    sectionId?: string | null;
    /** An embed's class contract hook on each pill (default none). */
    triggerClassName?: string;
    /** Only these saved rules of the pass, in this order (default every one, by kind). */
    ruleIds?: string[];
    /** The new filter's pill and the temporary or viewer's own ones (default true). */
    withExtras?: boolean;
};

type FilterPillGroup = 'dimensions' | 'metrics';

const GROUPS: FilterPillGroup[] = ['dimensions', 'metrics'];

export const FilterPills: FC<Props> = ({
    activeTabUuid,
    sectionId,
    triggerClassName,
    ruleIds,
    withExtras = true,
}) => {
    const editingFilterId = useControlsEditorSelector(
        (c) => c.editing?.filterId ?? null,
    );
    const isEditorOpen = useControlsEditorSelector((c) => c.isEditorOpen);
    const removeFilterById = useControlsEditorSelector(
        (c) => c.removeFilterById,
    );
    const isViewer = useControlsEditorSelector((c) => c.isViewer);
    // A new filter with its field picked: only in the draft until Apply
    const newRule = useControlsEditorSelector((c) =>
        c.isEditorOpen && c.isNew && !c.isPlaceholder ? c.editingRule : null,
    );
    // Its pill shows the dashboard as it is, so it is in effect only after Apply
    const newPillRule = useMemo(
        () => (newRule === null ? null : { ...newRule, disabled: true }),
        [newRule],
    );
    const temporaryFilters = useDashboardTemporaryFilters();
    const dashboardUuid = useDashboardContext((c) => c.dashboard?.uuid);
    const setDashboardFilters = useDashboardContext(
        (c) => c.setDashboardFilters,
    );
    const setHaveFiltersChanged = useDashboardContext(
        (c) => c.setHaveFiltersChanged,
    );
    const dashboardFilters = useDashboardSelector(selectDashboardFilters);
    const sections = useDashboardSelector(selectControlSections);
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
    // The first load, with nothing to place the pills by yet
    const isFirstLoad = useDashboardContext((c) => c.isLoadingDashboardFilters);
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
    const savedFilters = useDashboardContext((c) => c.dashboard?.filters);
    const getFieldsByTile = useStableCallback(() => filterableFieldsByTileUuid);
    const { getTabsUsingFilter, getOrphanedState } = useFilterTabPlacement();
    // Added in this edit session: not saved for everyone yet
    const isDraft = (filter: DashboardFilterRule, group: FilterPillGroup) =>
        savedFilters !== undefined &&
        !savedFilters[group].some((rule) => rule.id === filter.id);
    const dragSensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    );

    const handleDragEnd = (group: FilterPillGroup, event: DragEndEvent) => {
        const { active, over } = event;
        if (!active || !over || active.id === over.id) return;
        setDashboardFilters((filters) =>
            moveFilterRule(filters, group, active.id, over.id),
        );
        setHaveFiltersChanged(true);
    };

    const renderPill = (
        filter: DashboardFilterRule,
        group: FilterPillGroup,
        kind: FilterPillKind,
    ) => {
        const isSelected = editingFilterId === filter.id;
        const appliesToTabs = getTabsUsingFilter(filter);

        if (isFilterHiddenOnTab(appliesToTabs, activeTabUuid) && !isSelected) {
            return null;
        }
        const field = getDashboardFilterField<DashboardFilterableField>(
            group === 'metrics'
                ? allFilterableMetricsMap
                : allFilterableFieldsMap,
            filter,
            filterableFieldsByTileUuid,
        );
        const isUnresolved =
            !field &&
            !filter.target.isSqlColumn &&
            !isPlaceholderRule(filter) &&
            !areFieldsLoading;
        if (isUnresolved) {
            // The shipped pills for a deleted or hidden field: no editor
            return (
                <UnresolvedFilter
                    isEditMode={!isViewer && !isEditorOpen}
                    filterRule={filter}
                    onRemove={() => removeFilterById(filter.id)}
                />
            );
        }
        return (
            <FilterPill
                kind={kind}
                triggerClassName={triggerClassName}
                filter={filter}
                field={field}
                {...getOrphanedState(filter, appliesToTabs)}
                isSelected={isSelected}
                isDisabled={!areFieldsLoaded && !filter.target.isSqlColumn}
                isDraft={kind === 'editor' && isDraft(filter, group)}
                isEditorOpen={isEditorOpen}
                activeTabUuid={activeTabUuid}
                hasTabs={hasTabs}
                dashboardUuid={dashboardUuid}
                getFieldsByTile={getFieldsByTile}
            />
        );
    };

    // A saved pill: a viewer's opens the editor and never drags
    const renderSaved = (
        filter: DashboardFilterRule,
        group: FilterPillGroup,
    ) => {
        if (!isRuleInSection(filter, sectionId, sections)) return null;
        const pill = renderPill(
            filter,
            group,
            isViewer ? 'viewerSaved' : 'editor',
        );
        if (!pill) return null;
        if (isViewer) return <Fragment key={filter.id}>{pill}</Fragment>;
        const draggable = (
            <PillDraggable
                id={filter.id}
                isInBarContext={sectionId !== undefined}
                isDisabled={
                    isEditorOpen ||
                    (!areFieldsLoaded && !filter.target.isSqlColumn)
                }
            >
                {pill}
            </PillDraggable>
        );
        // The sectioned bar draws its own drop line; the flat bar keeps the shipped one
        return sectionId === undefined ? (
            <DroppableArea
                key={filter.id}
                id={filter.id}
                orderedKeys={dashboardFilters[group].map((rule) => rule.id)}
            >
                {draggable}
            </DroppableArea>
        ) : (
            <BarDroppable key={filter.id} id={filter.id}>
                {draggable}
            </BarDroppable>
        );
    };

    const newGroup: FilterPillGroup | null =
        newPillRule === null
            ? null
            : allFilterableMetricsMap[newPillRule.target.fieldId] !== undefined
              ? 'metrics'
              : 'dimensions';
    // Where it lands on Apply: last in its group. It neither drags nor drops
    // On Apply the store has the rule a render before the editor lets it go
    const isNewPillListed = (group: FilterPillGroup) =>
        newPillRule !== null &&
        [...dashboardFilters[group], ...temporaryFilters[group]].some(
            (filter) => filter.id === newPillRule.id,
        );
    const renderNewPill = (group: FilterPillGroup) =>
        newPillRule !== null &&
        newGroup === group &&
        !isNewPillListed(group) &&
        isRuleInSection(newPillRule, sectionId, sections) && (
            <Fragment key={newPillRule.id}>
                {renderPill(
                    newPillRule,
                    group,
                    isViewer ? 'viewerOwn' : 'editor',
                )}
            </Fragment>
        );

    // The shipped placeholders on the first load, in both modes, so the bar
    // settles once; a refetch keeps the pills where they are
    if (isFirstLoad) return <FilterPillSkeletons />;

    const saved =
        ruleIds !== undefined
            ? ruleIds.map((id) => {
                  const group = GROUPS.find((candidate) =>
                      dashboardFilters[candidate].some(
                          (rule) => rule.id === id,
                      ),
                  );
                  const filter =
                      group &&
                      dashboardFilters[group].find((rule) => rule.id === id);
                  return group && filter ? renderSaved(filter, group) : null;
              })
            : GROUPS.map((group) => {
                  const pills = dashboardFilters[group].map((filter) =>
                      renderSaved(filter, group),
                  );
                  if (isViewer) return <Fragment key={group}>{pills}</Fragment>;
                  return sectionId === undefined ? (
                      <DndContext
                          key={group}
                          sensors={dragSensors}
                          onDragEnd={(event) => handleDragEnd(group, event)}
                      >
                          {pills}
                          {withExtras && renderNewPill(group)}
                          <DragOverlay />
                      </DndContext>
                  ) : (
                      <Fragment key={group}>
                          {pills}
                          {withExtras && renderNewPill(group)}
                      </Fragment>
                  );
              });

    return (
        <>
            {saved}
            {ruleIds !== undefined &&
                withExtras &&
                !isViewer &&
                GROUPS.map(renderNewPill)}
            {/* A viewer's own filters open the editor too; in edit mode
                they keep the shipped popover. They are never in a section */}
            {withExtras &&
                (isViewer
                    ? typeof sectionId !== 'string' &&
                      GROUPS.flatMap((group) => [
                          ...temporaryFilters[group].map((filter) => {
                              const pill = renderPill(
                                  filter,
                                  group,
                                  'viewerOwn',
                              );
                              return (
                                  pill && (
                                      <Fragment key={filter.id}>
                                          {pill}
                                      </Fragment>
                                  )
                              );
                          }),
                          renderNewPill(group),
                      ])
                    : typeof sectionId !== 'string' && (
                          <TemporaryFilterPills activeTabUuid={activeTabUuid} />
                      ))}
        </>
    );
};
