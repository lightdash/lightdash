import { type AiAgentSummary } from '@lightdash/common';
import { useMemo } from 'react';
import {
    openPanel,
    type LauncherDockItem,
} from '../../store/aiAgentLauncherSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../../store/hooks';
import { useAiAgentThreadStreamAbortController } from '../../streaming/AiAgentThreadStreamAbortControllerContext';
import { useLauncherDock } from './useLauncherDock';

/** The open threads of a project, and what the user can do with them. */
export const useLauncherDockThreads = ({
    projectUuid,
    agents,
}: {
    projectUuid: string;
    agents: AiAgentSummary[];
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
    const view = useAiAgentStoreSelector((state) => state.aiAgentLauncher.view);
    const currentDashboard = useAiAgentStoreSelector(
        (state) => state.aiAgentLauncher.currentDashboard,
    );
    const currentDataApp = useAiAgentStoreSelector(
        (state) => state.aiAgentLauncher.currentDataApp,
    );
    const currentDocument = useAiAgentStoreSelector(
        (state) => state.aiAgentLauncher.currentDocument,
    );

    const agentsByUuid = useMemo(
        () => new Map(agents.map((a) => [a.uuid, a])),
        [agents],
    );
    const visibleDock = useMemo(
        () => dock.filter((item) => agentsByUuid.has(item.agentUuid)),
        [agentsByUuid, dock],
    );

    const isChatOpen = isPanelOpen && view === 'chat';

    const selectThread = (item: LauncherDockItem) => {
        dispatch(
            openPanel({
                threadId: item.threadId,
                agentUuid: item.agentUuid,
            }),
        );
    };

    const closeThread = (threadId: string) => {
        abort(threadId);
        removeItem(threadId);
    };

    const startNewThread = (agentUuid: string) => {
        const pendingContext =
            currentDashboard?.projectUuid === projectUuid
                ? { dashboardUuid: currentDashboard.uuid }
                : currentDataApp?.projectUuid === projectUuid
                  ? { dataAppUuid: currentDataApp.uuid }
                  : currentDocument?.projectUuid === projectUuid
                    ? { documentUuid: currentDocument.uuid }
                    : null;
        dispatch(
            openPanel({
                threadId: null,
                agentUuid,
                pendingContext,
            }),
        );
    };

    return {
        dock,
        visibleDock,
        agentsByUuid,
        removeItem,
        activeThreadId,
        isPanelOpen,
        view,
        isThreadActive: (item: LauncherDockItem) =>
            isChatOpen && item.threadId === activeThreadId,
        isNewThreadActive: isChatOpen && !activeThreadId,
        selectThread,
        closeThread,
        startNewThread,
    };
};
