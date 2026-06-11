import { Transition } from '@mantine-8/core';
import { useMediaQuery } from '@mantine-8/hooks';
import { useEffect, useRef, type FC } from 'react';
import { useLocation, useMatches } from 'react-router';
import { useActiveProjectUuid } from '../../../../../hooks/useActiveProject';
import { useAiAgentButtonVisibility } from '../../hooks/useAiAgentsButtonVisibility';
import { resetActivePanel } from '../../store/aiAgentLauncherSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../../store/hooks';
import styles from './AiAgentsLauncher.module.css';
import { LauncherDock } from './LauncherDock';
import { LauncherPanel } from './LauncherPanel';
import { launcherSession } from './launcherSession';
import { useDefaultAiAgent } from './useDefaultAiAgent';
import { useLauncherDock } from './useLauncherDock';

// Routes opt out of the launcher by setting `handle: { hideAILauncher: true }`
// on their RouteObject; the flag is inherited by all child routes.
const useIsLauncherHidden = () => {
    const matches = useMatches();
    return matches.some(
        (m) =>
            (m.handle as { hideAILauncher?: boolean } | undefined)
                ?.hideAILauncher,
    );
};

export const AiAgentsLauncher: FC = () => {
    const { pathname, search } = useLocation();
    const isMobile = useMediaQuery('(max-width: 768px)');
    const isHidden = useIsLauncherHidden();

    useEffect(() => {
        if (isHidden) return;
        launcherSession.rememberLastNonAgentUrl(`${pathname}${search}`);
        // Non-agent routes are the restore target. Clear the expanded marker
        // so direct fullscreen visits don't show Minimize.
        launcherSession.clearExpandedFromBubble();
    }, [isHidden, pathname, search]);

    if (isMobile || isHidden) return null;
    return <AiAgentsLauncherInner />;
};

const AiAgentsLauncherInner: FC = () => {
    const { activeProjectUuid } = useActiveProjectUuid();

    const isAiAgentEnabled = useAiAgentButtonVisibility();

    const { agents } = useDefaultAiAgent(activeProjectUuid);

    const dispatch = useAiAgentStoreDispatch();
    const mode = useAiAgentStoreSelector((state) => state.aiAgentLauncher.mode);
    const activeThreadId = useAiAgentStoreSelector(
        (state) => state.aiAgentLauncher.activeThreadId,
    );
    const activeAgentUuid = useAiAgentStoreSelector(
        (state) => state.aiAgentLauncher.activeAgentUuid,
    );
    const { dock } = useLauncherDock(activeProjectUuid);

    const prevProjectUuidRef = useRef(activeProjectUuid);
    useEffect(() => {
        if (
            prevProjectUuidRef.current &&
            prevProjectUuidRef.current !== activeProjectUuid
        ) {
            dispatch(resetActivePanel());
        }
        prevProjectUuidRef.current = activeProjectUuid;
    }, [activeProjectUuid, dispatch]);

    // Clear stale panel state when the active agent is not available in the
    // current project, e.g. after a project change while the launcher was hidden.
    useEffect(() => {
        if (!activeAgentUuid || agents.length === 0) return;
        if (!agents.some((a) => a.uuid === activeAgentUuid)) {
            dispatch(resetActivePanel());
        }
    }, [activeAgentUuid, agents, dispatch]);

    const isAllowed =
        Boolean(activeProjectUuid) && isAiAgentEnabled && agents.length > 0;

    // Only mount the panel when the active agent/thread belongs to this project;
    // mounting an existing-thread panel starts the thread query.
    const activeAgentBelongsToProject =
        activeAgentUuid !== null &&
        agents.some((a) => a.uuid === activeAgentUuid);
    const activeThreadBelongsToProject =
        activeThreadId !== null &&
        dock.some((item) => item.threadId === activeThreadId);
    const safeActiveAgentUuid = activeAgentBelongsToProject
        ? activeAgentUuid
        : null;
    const safeActiveThreadId =
        activeThreadId === null
            ? null
            : activeThreadBelongsToProject && activeAgentBelongsToProject
              ? activeThreadId
              : null;
    const isPanelOpenSafe =
        mode === 'panel-open' &&
        (safeActiveThreadId !== null || safeActiveAgentUuid !== null);

    // The launcher has no persistent affordance: it appears only when the
    // user opens a panel (via AskAiAgentMenuItem) or has active dock items.
    if (!isAllowed || !activeProjectUuid) return null;
    if (!isPanelOpenSafe && dock.length === 0) return null;

    const panelAgent =
        agents.find((a) => a.uuid === safeActiveAgentUuid) ?? null;

    return (
        <div className={styles.root}>
            <LauncherDock projectUuid={activeProjectUuid} agents={agents} />
            <Transition
                mounted={isPanelOpenSafe}
                transition="slide-up"
                duration={180}
                timingFunction="ease"
            >
                {(transitionStyle) => (
                    <LauncherPanel
                        projectUuid={activeProjectUuid}
                        agent={panelAgent}
                        agents={agents}
                        activeThreadId={safeActiveThreadId}
                        style={transitionStyle}
                    />
                )}
            </Transition>
        </div>
    );
};
