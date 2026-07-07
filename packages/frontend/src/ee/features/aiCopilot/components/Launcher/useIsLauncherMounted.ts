import { useAiAgentStoreSelector } from '../../store/hooks';
import { useLauncherDock } from './useLauncherDock';

export const useIsLauncherMounted = (
    projectUuid: string | undefined,
): boolean => {
    const { dock } = useLauncherDock(projectUuid);
    const isPanelOpen = useAiAgentStoreSelector(
        (state) => state.aiAgentLauncher.mode === 'panel-open',
    );
    return Boolean(projectUuid) || isPanelOpen || dock.length > 0;
};
