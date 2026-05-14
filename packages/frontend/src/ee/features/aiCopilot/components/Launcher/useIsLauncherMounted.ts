import { useAiAgentStoreSelector } from '../../store/hooks';
import { useLauncherDock } from './useLauncherDock';

/**
 * True when the AI launcher is currently rendering — either because a panel
 * is open or there are dock items for this project. Use this to push
 * bottom-anchored UI (e.g. ScrollToTop) above the launcher when it appears.
 */
export const useIsLauncherMounted = (
    projectUuid: string | undefined,
): boolean => {
    const { dock } = useLauncherDock(projectUuid);
    const isPanelOpen = useAiAgentStoreSelector(
        (state) => state.aiAgentLauncher.mode === 'panel-open',
    );
    return isPanelOpen || dock.length > 0;
};
