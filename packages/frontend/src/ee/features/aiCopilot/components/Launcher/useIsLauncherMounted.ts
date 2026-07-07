import { useAiAgentStoreSelector } from '../../store/hooks';
import { useLauncherDock } from './useLauncherDock';

export const useIsLauncherMounted = (
    projectUuid: string | undefined,
): boolean => {
    const { dock } = useLauncherDock(projectUuid);
    const isPanelOpen = useAiAgentStoreSelector(
        (state) => state.aiAgentLauncher.mode === 'panel-open',
    );
    const currentDashboard = useAiAgentStoreSelector(
        (state) => state.aiAgentLauncher.currentDashboard,
    );
    return (
        isPanelOpen ||
        dock.length > 0 ||
        currentDashboard?.projectUuid === projectUuid
    );
};
