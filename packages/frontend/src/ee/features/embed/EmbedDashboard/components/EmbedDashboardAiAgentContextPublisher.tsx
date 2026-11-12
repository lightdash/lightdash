import { useEffect, type FC } from 'react';
import {
    selectActiveTab,
    useDashboardSelector,
} from '../../../../../features/dashboard/store';
import { useDashboardAiAgentRuntimeOverrides } from '../../../../../providers/Dashboard/useDashboardAiAgentRuntimeOverrides';
import useDashboardContext from '../../../../../providers/Dashboard/useDashboardContext';
import { store as aiAgentStore } from '../../../aiCopilot/store';
import { setCurrentDashboard } from '../../../aiCopilot/store/aiAgentLauncherSlice';

const clearIfCurrent = (dashboardUuid: string) => {
    const { currentDashboard } = aiAgentStore.getState().aiAgentLauncher;
    if (currentDashboard?.uuid === dashboardUuid) {
        aiAgentStore.dispatch(setCurrentDashboard(null));
    }
};

// Shares the on-screen view state with an AI agent embedded on the same page.
export const EmbedDashboardAiAgentContextPublisher: FC = () => {
    const projectUuid = useDashboardContext((c) => c.projectUuid);
    const dashboard = useDashboardContext((c) => c.dashboard);
    const activeTab = useDashboardSelector(selectActiveTab);
    const runtimeOverrides = useDashboardAiAgentRuntimeOverrides();
    const dashboardUuid = dashboard?.uuid;
    const dashboardName = dashboard?.name;

    useEffect(() => {
        if (!projectUuid || !dashboardUuid || !dashboardName) return;
        aiAgentStore.dispatch(
            setCurrentDashboard({
                projectUuid,
                uuid: dashboardUuid,
                name: dashboardName,
                activeTabUuid: activeTab?.uuid ?? null,
                runtimeOverrides,
            }),
        );
    }, [
        activeTab?.uuid,
        dashboardName,
        dashboardUuid,
        projectUuid,
        runtimeOverrides,
    ]);

    useEffect(() => {
        if (!dashboardUuid) return undefined;
        return () => clearIfCurrent(dashboardUuid);
    }, [dashboardUuid]);

    return null;
};
