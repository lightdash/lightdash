import { Box, Transition } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useEffect, useRef, type FC } from 'react';
import { useMatches } from 'react-router';
import { useActiveProjectUuid } from '../../../../../hooks/useActiveProject';
import { useAiAgentButtonVisibility } from '../../hooks/useAiAgentsButtonVisibility';
import {
    resetActivePanel,
    setActiveAgent,
} from '../../store/aiAgentLauncherSlice';
import {
    selectDataAppPreview,
    selectSavedChartPreview,
} from '../../store/aiArtifactSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../../store/hooks';
import { AiDataAppPreviewPanel } from '../ChatElements/AiDataAppPreviewPanel';
import { AiSavedChartPreviewPanel } from '../ChatElements/AiSavedChartPreviewPanel';
import styles from './AiAgentsLauncher.module.css';
import { AiAgentsLauncherPortal } from './AiAgentsLauncherPortal';
import {
    getLauncherAgentUuid,
    getLauncherPanelAgent,
    isLauncherAgentAvailable,
} from './launcherAgentSelection';
import { LauncherDock } from './LauncherDock';
import { LauncherPanel } from './LauncherPanel';
import { LauncherPanelSizeContext } from './LauncherPanelSizeContext';
import {
    shouldRenderAiAgentsLauncher,
    shouldRenderAiAgentsLauncherContent,
} from './launcherVisibility';
import { useDefaultAiAgent } from './useDefaultAiAgent';
import { useLauncherDock } from './useLauncherDock';
import { useLauncherPanelSize } from './useLauncherPanelSize';

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
    const isMobile = useMediaQuery('(max-width: 768px)');
    const isHidden = useIsLauncherHidden();

    return (
        <AiAgentsLauncherPortal>
            {(isModalHosted) =>
                shouldRenderAiAgentsLauncher({
                    isHidden,
                    isMobile,
                    isModalHosted,
                }) ? (
                    <AiAgentsLauncherInner isModalHosted={isModalHosted} />
                ) : null
            }
        </AiAgentsLauncherPortal>
    );
};

const AiAgentsLauncherInner: FC<{ isModalHosted: boolean }> = ({
    isModalHosted,
}) => {
    const { activeProjectUuid } = useActiveProjectUuid();

    const isAiAgentEnabled = useAiAgentButtonVisibility();

    const { agents, agentsUpdatedAt, selectedAgent, isResolving } =
        useDefaultAiAgent(activeProjectUuid);

    const dispatch = useAiAgentStoreDispatch();
    const mode = useAiAgentStoreSelector((state) => state.aiAgentLauncher.mode);
    const activeThreadId = useAiAgentStoreSelector(
        (state) => state.aiAgentLauncher.activeThreadId,
    );
    const activeAgentUuid = useAiAgentStoreSelector(
        (state) => state.aiAgentLauncher.activeAgentUuid,
    );
    const savedChartPreview = useAiAgentStoreSelector(selectSavedChartPreview);
    const dataAppPreview = useAiAgentStoreSelector(selectDataAppPreview);
    const currentDashboard = useAiAgentStoreSelector(
        (state) => state.aiAgentLauncher.currentDashboard,
    );
    const currentDataApp = useAiAgentStoreSelector(
        (state) => state.aiAgentLauncher.currentDataApp,
    );
    const { dock } = useLauncherDock(activeProjectUuid);
    const panelSize = useLauncherPanelSize();

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
        if (
            !isLauncherAgentAvailable({
                activeAgentUuid,
                agents,
                selectedAgent,
            })
        ) {
            dispatch(resetActivePanel());
        }
    }, [activeAgentUuid, agents, dispatch, selectedAgent]);

    useEffect(() => {
        if (
            mode !== 'panel-open' ||
            activeAgentUuid !== null ||
            activeThreadId !== null ||
            isResolving ||
            !selectedAgent
        ) {
            return;
        }
        const resolvedAgentUuid = getLauncherAgentUuid(selectedAgent);
        if (resolvedAgentUuid) {
            dispatch(setActiveAgent(resolvedAgentUuid));
        }
    }, [
        mode,
        activeAgentUuid,
        activeThreadId,
        isResolving,
        selectedAgent,
        dispatch,
    ]);

    const isAllowed =
        Boolean(activeProjectUuid) && isAiAgentEnabled && agents.length > 0;

    // Only mount the panel when the active agent/thread belongs to this project;
    // mounting an existing-thread panel starts the thread query.
    const activeAgentBelongsToProject = isLauncherAgentAvailable({
        activeAgentUuid,
        agents,
        selectedAgent,
    });
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
    // A preview renders only where its thread is on screen.
    const activeSavedChartPreview =
        savedChartPreview !== null &&
        savedChartPreview.projectUuid === activeProjectUuid &&
        savedChartPreview.threadUuid === safeActiveThreadId
            ? savedChartPreview
            : null;
    const lastSavedChartPreviewRef = useRef(activeSavedChartPreview);
    if (activeSavedChartPreview) {
        lastSavedChartPreviewRef.current = activeSavedChartPreview;
    }
    const transitionSavedChartPreview =
        activeSavedChartPreview ?? lastSavedChartPreviewRef.current;
    const activeDataAppPreview =
        dataAppPreview !== null &&
        dataAppPreview.projectUuid === activeProjectUuid &&
        dataAppPreview.threadUuid === safeActiveThreadId
            ? dataAppPreview
            : null;
    const lastDataAppPreviewRef = useRef(activeDataAppPreview);
    if (activeDataAppPreview) {
        lastDataAppPreviewRef.current = activeDataAppPreview;
    }
    const transitionDataAppPreview =
        activeDataAppPreview ?? lastDataAppPreviewRef.current;
    const isContentPage =
        currentDashboard?.projectUuid === activeProjectUuid ||
        currentDataApp?.projectUuid === activeProjectUuid;

    if (
        !activeProjectUuid ||
        !shouldRenderAiAgentsLauncherContent({
            dockItemCount: dock.length,
            hasSelectedAgent: !!selectedAgent,
            isAllowed,
            isContentPage,
            isModalHosted,
            isPanelOpen: isPanelOpenSafe,
        })
    ) {
        return null;
    }

    const panelAgent = getLauncherPanelAgent(safeActiveAgentUuid, agents);

    return (
        <Box
            ref={panelSize.rootRef}
            className={styles.root}
            __vars={panelSize.rootVars}
        >
            <LauncherDock
                projectUuid={activeProjectUuid}
                agents={agents}
                agentsUpdatedAt={agentsUpdatedAt}
                selectedAgent={selectedAgent}
            />
            {transitionSavedChartPreview && (
                <Transition
                    mounted={
                        isPanelOpenSafe && activeSavedChartPreview !== null
                    }
                    transition="slide-up"
                    duration={180}
                    timingFunction="ease"
                >
                    {(transitionStyle) => (
                        <Box
                            className={styles.previewPanel}
                            style={transitionStyle}
                        >
                            <AiSavedChartPreviewPanel
                                savedChartPreview={transitionSavedChartPreview}
                            />
                        </Box>
                    )}
                </Transition>
            )}
            {transitionDataAppPreview && (
                <Transition
                    mounted={isPanelOpenSafe && activeDataAppPreview !== null}
                    transition="slide-up"
                    duration={180}
                    timingFunction="ease"
                >
                    {(transitionStyle) => (
                        <Box
                            className={styles.previewPanel}
                            style={transitionStyle}
                        >
                            <AiDataAppPreviewPanel
                                dataAppPreview={transitionDataAppPreview}
                                showInspector={false}
                            />
                        </Box>
                    )}
                </Transition>
            )}
            <Transition
                mounted={isPanelOpenSafe}
                transition="slide-up"
                duration={180}
                timingFunction="ease"
            >
                {(transitionStyle) => (
                    <LauncherPanelSizeContext.Provider
                        value={panelSize.context}
                    >
                        <LauncherPanel
                            projectUuid={activeProjectUuid}
                            agent={panelAgent}
                            agents={agents}
                            activeThreadId={safeActiveThreadId}
                            style={transitionStyle}
                        />
                    </LauncherPanelSizeContext.Provider>
                )}
            </Transition>
        </Box>
    );
};
