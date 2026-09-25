import {
    applyDimensionOverrides,
    isChartScheduler,
    isDashboardScheduler,
    serializeDashboardFiltersForAiContext,
    type AiChartRuntimeOverrides,
    type AiDashboardRuntimeOverrides,
    type DashboardDAO,
    type DashboardFilters,
    type ParametersValuesMap,
    type SchedulerAndTargets,
    type SendNowScheduler,
} from '@lightdash/common';
import { getDashboardParametersValuesMap } from '../../../services/ProjectService/parameters';

export const getDeliveryDashboardFilters = (
    dashboard: DashboardDAO,
    scheduler: SchedulerAndTargets | SendNowScheduler,
): DashboardFilters =>
    isDashboardScheduler(scheduler) && scheduler.filters
        ? {
              ...dashboard.filters,
              dimensions: applyDimensionOverrides(
                  dashboard.filters,
                  scheduler.filters,
              ),
          }
        : dashboard.filters;

export const getDeliveryDashboardParameters = (
    dashboard: DashboardDAO,
    scheduler: SchedulerAndTargets | SendNowScheduler,
): ParametersValuesMap => ({
    ...getDashboardParametersValuesMap(dashboard),
    ...(isDashboardScheduler(scheduler) ? scheduler.parameters : {}),
});

export const getDeliverySelectedTabs = (
    scheduler: SchedulerAndTargets | SendNowScheduler,
): string[] | null =>
    isDashboardScheduler(scheduler) ? (scheduler.selectedTabs ?? null) : null;

// The pinned context only holds one active tab, so a multi-tab selection is
// conveyed through the delivery data sections instead.
export const getDashboardRuntimeOverrides = (
    dashboard: DashboardDAO,
    scheduler: SchedulerAndTargets | SendNowScheduler,
): AiDashboardRuntimeOverrides => {
    const parameters = getDeliveryDashboardParameters(dashboard, scheduler);
    const selectedTabs = getDeliverySelectedTabs(scheduler);
    const activeTab =
        selectedTabs?.length === 1
            ? dashboard.tabs.find((tab) => tab.uuid === selectedTabs[0])
            : undefined;
    return {
        dashboardFilters: serializeDashboardFiltersForAiContext(
            getDeliveryDashboardFilters(dashboard, scheduler),
        ),
        ...(Object.keys(parameters).length > 0
            ? { dashboardParameters: parameters }
            : {}),
        ...(activeTab
            ? { activeTab: { uuid: activeTab.uuid, name: activeTab.name } }
            : {}),
    };
};

// Chart-native filter overrides have no slot in the pinned chart context; the
// delivery data the agent receives already has them applied.
export const getChartRuntimeOverrides = (
    scheduler: SchedulerAndTargets | SendNowScheduler,
): AiChartRuntimeOverrides | null =>
    isChartScheduler(scheduler) &&
    scheduler.parameters &&
    Object.keys(scheduler.parameters).length > 0
        ? { dashboardParameters: scheduler.parameters }
        : null;
