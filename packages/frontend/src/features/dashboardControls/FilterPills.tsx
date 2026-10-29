import {
    DndContext,
    DragOverlay,
    useDraggable,
    type DragEndEvent,
} from '@dnd-kit/core';
import {
    getDashboardFilterField,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import { Box } from '@mantine/core';
import {
    Fragment,
    useLayoutEffect,
    useMemo,
    useRef,
    type FC,
    type ReactNode,
} from 'react';
import { DroppableArea } from '../../components/common/DndHelpers';
import dndClasses from '../../components/common/DndHelpers.module.css';
import { useDndSensors } from '../../hooks/useDndSensors';
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
import { FilterPill, type FilterPillKind } from './FilterPill';
import classes from './FilterPills.module.css';
import { PillDragHandleContext } from './pillDragHandle';
import { isRuleInSection } from './sections';
import { isPlaceholderRule } from './sidebarState';
import { TemporaryFilterPills } from './TemporaryFilterPills';
import { useControlsSidebarSelector } from './useControlsSidebar';

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
    /** The sectioned bar's loose pass: rule id to the kinds (space separated)
     * a pill leaving its section lands after (default none). */
    looseEnds?: Record<string, string>;
};

type FilterPillGroup = 'dimensions' | 'metrics';

const GROUPS: FilterPillGroup[] = ['dimensions', 'metrics'];

// A pill's drag: it starts from the grip alone, so the wrapper takes no
// focus and Enter or Space on the pill opens it. On the sectioned bar's one
// drag context the overlay moves and the source fades, also while a filter
// is edited; on the flat bar the pill itself moves
const PillDraggable: FC<{
    id: string;
    isInBarContext: boolean;
    isDisabled: boolean;
    looseEnd: string | undefined;
    children: ReactNode;
}> = ({ id, isInBarContext, isDisabled, looseEnd, children }) => {
    const {
        listeners,
        setNodeRef,
        setActivatorNodeRef,
        isDragging,
        transform,
    } = useDraggable({ id, disabled: isDisabled });
    // The sensors are rebuilt on every bar render: the handle calls the
    // latest listeners, so the memoised pill never re-renders for them
    const latestListeners = useRef(listeners);
    useLayoutEffect(() => {
        latestListeners.current = listeners;
    });
    const eventNames = Object.keys(listeners ?? {}).join(' ');
    const handle = useMemo(
        () =>
            isDisabled
                ? null
                : {
                      setNode: setActivatorNodeRef,
                      listeners: Object.fromEntries(
                          eventNames
                              .split(' ')
                              .filter(Boolean)
                              .map((name) => [
                                  name,
                                  (event: unknown) =>
                                      latestListeners.current?.[name]?.(event),
                              ]),
                      ),
                  },
        [isDisabled, setActivatorNodeRef, eventNames],
    );
    return (
        <Box
            ref={setNodeRef}
            className={
                isInBarContext ? classes.barDraggable : dndClasses.draggable
            }
            data-dragging={
                (isInBarContext ? isDragging : !!transform) || undefined
            }
            data-loose-end={looseEnd}
            style={{
                '--drag-x':
                    !isInBarContext && transform
                        ? `${transform.x}px`
                        : undefined,
                '--drag-y':
                    !isInBarContext && transform
                        ? `${transform.y}px`
                        : undefined,
            }}
        >
            <PillDragHandleContext.Provider value={handle}>
                {children}
            </PillDragHandleContext.Provider>
        </Box>
    );
};

export const FilterPills: FC<Props> = ({
    activeTabUuid,
    sectionId,
    triggerClassName,
    looseEnds,
}) => {
    const editingFilterId = useControlsSidebarSelector(
        (c) => c.editing?.filterId ?? null,
    );
    const isSidebarOpen = useControlsSidebarSelector((c) => c.isSidebarOpen);
    const removeFilterById = useControlsSidebarSelector(
        (c) => c.removeFilterById,
    );
    const isViewer = useControlsSidebarSelector((c) => c.isViewer);
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
    const dragSensors = useDndSensors();

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
                    isEditMode={!isViewer && !isSidebarOpen}
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
                isSidebarOpen={isSidebarOpen}
                activeTabUuid={activeTabUuid}
                hasTabs={hasTabs}
                dashboardUuid={dashboardUuid}
                getFieldsByTile={getFieldsByTile}
            />
        );
    };

    // The shipped placeholders on the first load, in both modes, so the bar
    // settles once; a refetch keeps the pills where they are
    if (isFirstLoad) return <FilterPillSkeletons />;

    return (
        <>
            {/* A viewer's saved filters open the same editor; they never drag */}
            {isViewer
                ? GROUPS.flatMap((group) =>
                      dashboardFilters[group].map((filter) => {
                          if (!isRuleInSection(filter, sectionId, sections))
                              return null;
                          const pill = renderPill(filter, group, 'viewerSaved');
                          return (
                              pill && (
                                  <Fragment key={filter.id}>{pill}</Fragment>
                              )
                          );
                      }),
                  )
                : GROUPS.map((group) => {
                      const orderedKeys = dashboardFilters[group].map(
                          (rule) => rule.id,
                      );
                      const pills = dashboardFilters[group].map((filter) => {
                          if (!isRuleInSection(filter, sectionId, sections))
                              return null;
                          const pill = renderPill(filter, group, 'editor');
                          return (
                              pill && (
                                  <DroppableArea
                                      key={filter.id}
                                      id={filter.id}
                                      orderedKeys={orderedKeys}
                                  >
                                      <PillDraggable
                                          id={filter.id}
                                          isInBarContext={
                                              sectionId !== undefined
                                          }
                                          isDisabled={
                                              sectionId === undefined &&
                                              isSidebarOpen
                                          }
                                          looseEnd={looseEnds?.[filter.id]}
                                      >
                                          {pill}
                                      </PillDraggable>
                                  </DroppableArea>
                              )
                          );
                      });
                      return sectionId === undefined ? (
                          <DndContext
                              key={group}
                              sensors={dragSensors}
                              onDragEnd={(event) => handleDragEnd(group, event)}
                          >
                              {pills}
                              <DragOverlay />
                          </DndContext>
                      ) : (
                          <Fragment key={group}>{pills}</Fragment>
                      );
                  })}
            {/* A viewer's own filters open the editor too; in edit mode
                they keep the shipped popover. They are never in a section */}
            {isViewer
                ? typeof sectionId !== 'string' &&
                  GROUPS.flatMap((group) =>
                      temporaryFilters[group].map((filter) => {
                          const pill = renderPill(filter, group, 'viewerOwn');
                          return (
                              pill && (
                                  <Fragment key={filter.id}>{pill}</Fragment>
                              )
                          );
                      }),
                  )
                : typeof sectionId !== 'string' && (
                      <TemporaryFilterPills activeTabUuid={activeTabUuid} />
                  )}
        </>
    );
};
