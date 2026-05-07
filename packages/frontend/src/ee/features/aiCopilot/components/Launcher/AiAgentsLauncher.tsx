import { Transition } from '@mantine-8/core';
import { useMediaQuery } from '@mantine-8/hooks';
import { useEffect, useRef, type FC } from 'react';
import { useLocation } from 'react-router';
import { useActiveProjectUuid } from '../../../../../hooks/useActiveProject';
import { useAiAgentButtonVisibility } from '../../hooks/useAiAgentsButtonVisibility';
import { openPanel, resetActivePanel } from '../../store/aiAgentLauncherSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../../store/hooks';
import styles from './AiAgentsLauncher.module.css';
import { LauncherDock } from './LauncherDock';
import { LauncherPanel } from './LauncherPanel';
import { LauncherPill } from './LauncherPill';
import { launcherSession } from './launcherSession';
import { useDefaultAiAgent } from './useDefaultAiAgent';
import { useLauncherDock } from './useLauncherDock';

const HIDDEN_ROUTE_PREFIXES = [
    '/minimal',
    '/embed',
    '/generalSettings',
    '/createProjectSettings',
];

const isFullscreenAiAgentRoute = (pathname: string) =>
    /^\/projects\/[^/]+\/ai-agents(\/|$)/.test(pathname);

const isHiddenRoute = (pathname: string) =>
    HIDDEN_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));

export const AiAgentsLauncher: FC = () => {
    const location = useLocation();
    const { pathname, search } = location;
    const isMobile = useMediaQuery('(max-width: 768px)');

    useEffect(() => {
        if (isFullscreenAiAgentRoute(pathname)) return;
        if (isHiddenRoute(pathname)) return;
        launcherSession.rememberLastNonAgentUrl(`${pathname}${search}`);
        // Non-agent routes are the restore target. Clear the expanded marker
        // so direct fullscreen visits don't show Minimize.
        launcherSession.clearExpandedFromBubble();
    }, [pathname, search]);

    if (isMobile) return null;
    if (isHiddenRoute(pathname)) return null;
    if (isFullscreenAiAgentRoute(pathname)) return null;
    return <AiAgentsLauncherInner />;
};

const AiAgentsLauncherInner: FC = () => {
    const { activeProjectUuid } = useActiveProjectUuid();

    const isAiAgentEnabled = useAiAgentButtonVisibility();

    const { agent, agents } = useDefaultAiAgent(activeProjectUuid);

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

    const isVisible =
        Boolean(activeProjectUuid) && isAiAgentEnabled && agents.length > 0;

    if (!isVisible || !activeProjectUuid) return null;

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

    const panelAgent =
        agents.find((a) => a.uuid === safeActiveAgentUuid) ?? agent;

    const handlePillClick = () => {
        if (!agent) return;
        dispatch(openPanel({ threadId: null, agentUuid: agent.uuid }));
    };

    return (
        <div className={styles.root}>
            <LauncherDock projectUuid={activeProjectUuid} agents={agents} />
            <div className={styles.pillWrapper}>
                <LauncherPill agent={agent} onClick={handlePillClick} />
                <Transition
                    mounted={isPanelOpenSafe}
                    transition="fade-up"
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
        </div>
    );
};
