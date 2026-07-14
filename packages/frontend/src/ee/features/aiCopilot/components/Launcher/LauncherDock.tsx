import { type AiAgentSummary } from '@lightdash/common';
import { Box } from '@mantine-8/core';
import { useEffect, useMemo, type FC } from 'react';
import {
    openPanel,
    type LauncherDockItem,
} from '../../store/aiAgentLauncherSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../../store/hooks';
import { useAiAgentThreadStreamAbortController } from '../../streaming/AiAgentThreadStreamAbortControllerContext';
import { AiAgentIcon } from '../AiAgentIcon';
import styles from './AiAgentsLauncher.module.css';
import { DockTab } from './DockTab';
import {
    getLauncherAgentUuid,
    type LauncherSelectedAgent,
} from './launcherAgentSelection';
import { useLauncherDock } from './useLauncherDock';

type Props = {
    projectUuid: string;
    agents: AiAgentSummary[];
    selectedAgent: LauncherSelectedAgent;
};

export const LauncherDock: FC<Props> = ({
    projectUuid,
    agents,
    selectedAgent,
}) => {
    const dispatch = useAiAgentStoreDispatch();
    const { abort } = useAiAgentThreadStreamAbortController();
    const { dock, removeItem } = useLauncherDock(projectUuid);
    const activeThreadId = useAiAgentStoreSelector(
        (state) => state.aiAgentLauncher.activeThreadId,
    );
    const isPanelOpen = useAiAgentStoreSelector(
        (state) => state.aiAgentLauncher.mode === 'panel-open',
    );
    const currentDashboard = useAiAgentStoreSelector(
        (state) => state.aiAgentLauncher.currentDashboard,
    );

    const agentsByUuid = useMemo(
        () => new Map(agents.map((a) => [a.uuid, a])),
        [agents],
    );
    const visibleDock = useMemo(
        () => dock.filter((item) => agentsByUuid.has(item.agentUuid)),
        [agentsByUuid, dock],
    );

    useEffect(() => {
        dock.forEach((item) => {
            if (!agentsByUuid.has(item.agentUuid)) {
                removeItem(item.threadId);
            }
        });
    }, [agentsByUuid, dock, removeItem]);

    const handleSelect = (item: LauncherDockItem) => {
        dispatch(
            openPanel({
                threadId: item.threadId,
                agentUuid: item.agentUuid,
            }),
        );
    };

    const handleClose = (threadId: string) => {
        abort(threadId);
        removeItem(threadId);
    };

    const handleNewThread = () => {
        const agentUuid = getLauncherAgentUuid(selectedAgent);
        if (!agentUuid) return;
        const pendingContext =
            currentDashboard?.projectUuid === projectUuid
                ? {
                      dashboardUuid: currentDashboard.uuid,
                  }
                : null;
        dispatch(
            openPanel({
                threadId: null,
                agentUuid,
                pendingContext,
            }),
        );
    };

    return (
        <Box className={styles.dock}>
            {visibleDock.map((item) => (
                <DockTab
                    key={item.threadId}
                    item={item}
                    agent={agentsByUuid.get(item.agentUuid)!}
                    isActive={isPanelOpen && item.threadId === activeThreadId}
                    onSelect={handleSelect}
                    onClose={handleClose}
                />
            ))}
            {selectedAgent && (
                <Box
                    component="button"
                    type="button"
                    title="Ask AI Agent"
                    aria-label="Ask AI Agent"
                    className={`${styles.dockTab} ${styles.dockIconTab} ${isPanelOpen && !activeThreadId ? styles.dockTabActive : ''}`}
                    onClick={handleNewThread}
                >
                    <AiAgentIcon size={16} />
                </Box>
            )}
        </Box>
    );
};
