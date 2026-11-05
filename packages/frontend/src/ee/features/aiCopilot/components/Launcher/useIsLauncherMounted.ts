import { useAiAgentButtonVisibility } from '../../hooks/useAiAgentsButtonVisibility';
import { useAiAgentStoreSelector } from '../../store/hooks';
import { useLauncherAnalysisAdapter } from './launcherAnalysisAdapter';
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
    const currentDocument = useAiAgentStoreSelector(
        (state) => state.aiAgentLauncher.currentDocument,
    );
    const isContentPage =
        currentDashboard?.projectUuid === projectUuid ||
        currentDataApp?.projectUuid === projectUuid ||
        currentDocument?.projectUuid === projectUuid;
    // Analysis is agentless, so a registered adapter mounts the launcher even
    // for viewers with no AI-agent access.
    const hasAnalysis = useLauncherAnalysisAdapter(projectUuid) !== null;
    return (
        isPanelOpen ||
        dock.length > 0 ||
        (isContentPage && (isAiAgentEnabled || hasAnalysis))
    );
};
