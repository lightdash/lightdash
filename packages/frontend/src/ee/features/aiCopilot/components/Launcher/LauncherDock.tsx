import { type AiAgentSummary } from '@lightdash/common';
import { Box } from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import { useEffect, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { openAnalysisPanel } from '../../store/aiAgentLauncherSlice';
import { useAiAgentStoreDispatch } from '../../store/hooks';
import { AiAgentIcon } from '../AiAgentIcon';
import styles from './AiAgentsLauncher.module.css';
import { DockTab } from './DockTab';
import {
    getLauncherAgentUuid,
    type LauncherSelectedAgent,
} from './launcherAgentSelection';
import { useLauncherAnalysisAdapter } from './launcherAnalysisAdapter';
import { LAUNCHER_DOCK_EXTRAS_ID } from './launcherDockExtras';
import { useLauncherDockThreads } from './useLauncherDockThreads';

type Props = {
    projectUuid: string;
    agents: AiAgentSummary[];
    agentsUpdatedAt: number;
    selectedAgent: LauncherSelectedAgent;
    showAskAiLabel: boolean;
    /** Open threads collapse into a count on the Ask AI button. */
    isCompact: boolean;
};

export const LauncherDock: FC<Props> = ({
    projectUuid,
    agents,
    agentsUpdatedAt,
    selectedAgent,
    showAskAiLabel,
    isCompact,
}) => {
    const dispatch = useAiAgentStoreDispatch();
    const {
        dock,
        visibleDock,
        agentsByUuid,
        removeItem,
        activeThreadId,
        isPanelOpen,
        view,
        isThreadActive,
        isNewThreadActive,
        selectThread,
        closeThread,
        startNewThread,
    } = useLauncherDockThreads({ projectUuid, agents });
    // The tab is a handle to an analysis, not an entry point: before one
    // exists the new-thread teaser is the way in, so no tab for a quiet view
    // — unless there is no agent to chat with, making the tab the only door.
    const analysisAdapter = useLauncherAnalysisAdapter(projectUuid);
    const showAnalysisTab =
        analysisAdapter !== null &&
        (analysisAdapter.controller.state.status !== 'idle' ||
            selectedAgent === null ||
            (isPanelOpen && view === 'analysis'));

    // The dock is shared across tabs: only prune deleted-agent items when this
    // tab's agents list is newer than the item, else a stale cache in another
    // tab would delete a thread created after it was fetched.
    useEffect(() => {
        dock.forEach((item) => {
            if (item.threadId === activeThreadId) return;
            if (agentsUpdatedAt <= (item.createdAt ?? 0)) return;
            if (!agentsByUuid.has(item.agentUuid)) {
                removeItem(item.threadId);
            }
        });
    }, [activeThreadId, agentsByUuid, agentsUpdatedAt, dock, removeItem]);

    const handleNewThread = () => {
        const agentUuid = getLauncherAgentUuid(selectedAgent);
        if (agentUuid) startNewThread(agentUuid);
    };

    const lastActiveItem = visibleDock.find(
        (item) => item.threadId === activeThreadId,
    );
    const handleCompactOpen = () =>
        lastActiveItem ? selectThread(lastActiveItem) : handleNewThread();
    const openThreadCount = isCompact ? visibleDock.length : 0;

    return (
        <Box
            className={`${styles.dock} ${isCompact ? styles.dockCompact : ''}`}
        >
            {!isCompact &&
                visibleDock.map((item) => (
                    <DockTab
                        key={item.threadId}
                        item={item}
                        agent={agentsByUuid.get(item.agentUuid)!}
                        isActive={isThreadActive(item)}
                        onSelect={selectThread}
                        onClose={closeThread}
                    />
                ))}
            {showAnalysisTab && (
                <Box
                    component="button"
                    type="button"
                    title="AI analysis"
                    aria-label="AI analysis"
                    className={`${styles.dockTab} ${styles.dockIconTab} ${isPanelOpen && view === 'analysis' ? styles.dockTabActive : ''}`}
                    onClick={() => dispatch(openAnalysisPanel())}
                >
                    <MantineIcon icon={IconSparkles} size={16} />
                </Box>
            )}
            {/* Other features place their own dock buttons here. */}
            <span id={LAUNCHER_DOCK_EXTRAS_ID} className={styles.dockExtras} />
            {selectedAgent && (
                <Box
                    component="button"
                    type="button"
                    title="Ask AI Agent"
                    aria-label={
                        openThreadCount > 0
                            ? `Ask AI Agent, ${openThreadCount} open threads`
                            : 'Ask AI Agent'
                    }
                    className={`${styles.dockTab} ${styles.dockAskAi} ${showAskAiLabel ? '' : styles.dockIconTab} ${isNewThreadActive ? styles.dockTabActive : ''}`}
                    onClick={isCompact ? handleCompactOpen : handleNewThread}
                >
                    <AiAgentIcon size={16} />
                    {showAskAiLabel && (
                        <span className={styles.dockTabTitle}>Ask AI</span>
                    )}
                    {openThreadCount > 0 && (
                        <Box component="span" className={styles.dockBadge}>
                            {openThreadCount}
                        </Box>
                    )}
                </Box>
            )}
        </Box>
    );
};
