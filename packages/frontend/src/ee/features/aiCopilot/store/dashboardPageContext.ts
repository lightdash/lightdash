import {
    serializeDashboardFiltersForAiContext,
    type AiDashboardRuntimeOverrides,
    type AiPromptContext,
    type AiPromptContextInput,
    type DashboardFilters,
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
}: {
    defaultFilters: DashboardFilters;
    effectiveFilters: DashboardFilters;
}): AiDashboardRuntimeOverrides | null =>
    isEqual(defaultFilters, effectiveFilters)
        ? null
        : {
              dashboardFilters:
                  serializeDashboardFiltersForAiContext(effectiveFilters),
          };

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
