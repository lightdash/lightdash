import {
    selectActiveTabUuid,
    selectDashboardFilters,
    useDashboardSelector,
    useDashboardTemporaryFilters,
} from '../dashboard/store';
import {
    isFilterHiddenOnTab,
    useFilterTabPlacement,
} from '../dashboardFilters/ActiveFilters/useFilterTabPlacement';
import { useDateZoomBar } from './useDateZoomBar';
import { useParameterBarControls } from './useParameterBarControls';
import { useParameterEditorSelector } from './useParameterEditor';

export type ControlCounts = {
    filters: number;
    parameters: number;
    dateZooms: number;
};

export const getControlTotal = (counts: ControlCounts) =>
    counts.filters + counts.parameters + counts.dateZooms;

/** The controls on the tab in view that the user sees: a viewer's skip hidden ones */
export const useControlCounts = (): ControlCounts => {
    const activeTabUuid = useDashboardSelector(selectActiveTabUuid);
    const filters = useDashboardSelector(selectDashboardFilters);
    const temporaryFilters = useDashboardTemporaryFilters();
    const { getTabsUsingFilter } = useFilterTabPlacement();
    const parameterBar = useParameterBarControls();
    const isViewer = useParameterEditorSelector((c) => c.isViewer);
    const dateZooms = useDateZoomBar();
    return {
        filters: [filters, temporaryFilters]
            .flatMap((group) => [
                ...group.dimensions,
                ...group.metrics,
                ...group.tableCalculations,
            ])
            .filter(
                (rule) =>
                    !isFilterHiddenOnTab(
                        getTabsUsingFilter(rule),
                        activeTabUuid,
                    ),
            ).length,
        parameters: parameterBar.entries.filter(
            ({ control }) => !(isViewer && control.hidden),
        ).length,
        dateZooms: dateZooms.filter(({ isNew }) => !isNew).length,
    };
};
