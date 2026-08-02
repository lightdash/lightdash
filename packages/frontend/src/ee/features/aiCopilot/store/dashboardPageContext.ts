import {
    serializeDashboardFiltersForAiContext,
    type AiDashboardRuntimeOverrides,
    type AiPromptContext,
    type AiPromptContextInput,
    type DashboardFilters,
    type DashboardParameters,
    type DashboardTab,
    type DateZoom,
    type ParametersValuesMap,
} from '@lightdash/common';
import isEqual from 'lodash/isEqual';
import { type LauncherCurrentDashboard } from './aiAgentLauncherSlice';

type DashboardContextInput = Extract<
    AiPromptContextInput[number],
    { type: 'dashboard' }
>;
type DashboardContextItem = Extract<
    AiPromptContext[number],
    { type: 'dashboard' }
>;
type DashboardContext = DashboardContextInput | DashboardContextItem;

export const getNonDefaultDashboardRuntimeOverrides = ({
    defaultFilters,
    effectiveFilters,
    defaultParameters,
    effectiveParameters,
    defaultDateZoom,
    effectiveDateZoom,
}: {
    defaultFilters: DashboardFilters;
    effectiveFilters: DashboardFilters;
    defaultParameters: ParametersValuesMap;
    effectiveParameters: ParametersValuesMap;
    defaultDateZoom: DateZoom | null;
    effectiveDateZoom: DateZoom | null;
}): AiDashboardRuntimeOverrides | null => {
    const overrides: AiDashboardRuntimeOverrides = {};

    if (!isEqual(defaultFilters, effectiveFilters)) {
        overrides.dashboardFilters =
            serializeDashboardFiltersForAiContext(effectiveFilters);
    }
    if (!isEqual(defaultParameters, effectiveParameters)) {
        overrides.dashboardParameters = effectiveParameters;
    }
    if (!isEqual(defaultDateZoom, effectiveDateZoom)) {
        overrides.dateZoom = effectiveDateZoom;
    }

    return Object.keys(overrides).length > 0 ? overrides : null;
};

export const addActiveTabToDashboardRuntimeOverrides = ({
    activeTab,
    runtimeOverrides,
}: {
    activeTab: Pick<DashboardTab, 'uuid' | 'name'> | null | undefined;
    runtimeOverrides: AiDashboardRuntimeOverrides | null;
}): AiDashboardRuntimeOverrides | null =>
    activeTab
        ? {
              ...runtimeOverrides,
              activeTab: { uuid: activeTab.uuid, name: activeTab.name },
          }
        : runtimeOverrides;

export const getDashboardParametersValuesMap = (
    parameters: DashboardParameters,
): ParametersValuesMap =>
    Object.fromEntries(
        Object.entries(parameters).flatMap(([key, parameter]) =>
            parameter.value === null ||
            parameter.value === undefined ||
            parameter.value === ''
                ? []
                : [[key, parameter.value]],
        ),
    );

export const getLastDashboardContext = (
    context: Array<AiPromptContextInput[number] | AiPromptContext[number]>,
): DashboardContext | null => {
    for (let index = context.length - 1; index >= 0; index -= 1) {
        const item = context[index];
        if (item.type === 'dashboard') return item;
    }
    return null;
};

const shouldAttachCurrentDashboard = ({
    currentDashboard,
    previousDashboardContext,
    projectUuid,
}: {
    currentDashboard: LauncherCurrentDashboard | null;
    previousDashboardContext?: DashboardContext | null;
    projectUuid: string;
}) => {
    if (currentDashboard?.projectUuid !== projectUuid) return false;
    if (previousDashboardContext?.dashboardUuid !== currentDashboard.uuid)
        return true;

    return !isEqual(
        previousDashboardContext.runtimeOverrides ?? null,
        currentDashboard.runtimeOverrides,
    );
};

export const getCurrentDashboardPromptContext = ({
    currentDashboard,
    previousDashboardContext,
    projectUuid,
}: {
    currentDashboard: LauncherCurrentDashboard | null;
    previousDashboardContext?: DashboardContext | null;
    projectUuid: string;
}): AiPromptContextInput =>
    currentDashboard &&
    shouldAttachCurrentDashboard({
        currentDashboard,
        previousDashboardContext,
        projectUuid,
    })
        ? [
              {
                  type: 'dashboard',
                  dashboardUuid: currentDashboard.uuid,
                  runtimeOverrides:
                      currentDashboard.runtimeOverrides ?? undefined,
              },
          ]
        : [];

export const getCurrentDashboardOptimisticContext = ({
    currentDashboard,
    previousDashboardContext,
    projectUuid,
}: {
    currentDashboard: LauncherCurrentDashboard | null;
    previousDashboardContext?: DashboardContext | null;
    projectUuid: string;
}): AiPromptContext =>
    currentDashboard &&
    shouldAttachCurrentDashboard({
        currentDashboard,
        previousDashboardContext,
        projectUuid,
    })
        ? [
              {
                  type: 'dashboard',
                  dashboardUuid: currentDashboard.uuid,
                  dashboardSlug: null,
                  displayName: currentDashboard.name,
                  pinnedVersionUuid: null,
                  runtimeOverrides: currentDashboard.runtimeOverrides,
              },
          ]
        : [];
