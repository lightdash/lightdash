import { useAiAgentButtonVisibility } from '../../hooks/useAiAgentsButtonVisibility';
import { useAiAgentStoreSelector } from '../../store/hooks';
import { useLauncherDock } from './useLauncherDock';

export const useIsLauncherMounted = (
    projectUuid: string | undefined,
): boolean => {
    const { dock } = useLauncherDock(projectUuid);
    const isAiAgentEnabled = useAiAgentButtonVisibility();
    const isPanelOpen = useAiAgentStoreSelector(
        (state) => state.aiAgentLauncher.mode === 'panel-open',
    );
    const currentDashboard = useAiAgentStoreSelector(
        (state) => state.aiAgentLauncher.currentDashboard,
    );
    const currentDataApp = useAiAgentStoreSelector(
        (state) => state.aiAgentLauncher.currentDataApp,
    );
    const isContentPage =
        currentDashboard?.projectUuid === projectUuid ||
        currentDataApp?.projectUuid === projectUuid;
    return (
        isPanelOpen || dock.length > 0 || (isContentPage && isAiAgentEnabled)
    );
};
