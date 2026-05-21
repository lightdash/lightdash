import { type AiAgentSummary } from '@lightdash/common';
import { useMemo, type FC } from 'react';
import {
    openPanel,
    type LauncherDockItem,
} from '../../store/aiAgentLauncherSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../../store/hooks';
import { useAiAgentThreadStreamAbortController } from '../../streaming/AiAgentThreadStreamAbortControllerContext';
import styles from './AiAgentsLauncher.module.css';
import { DockTab } from './DockTab';
import { useLauncherDock } from './useLauncherDock';

type Props = { projectUuid: string; agents: AiAgentSummary[] };

export const LauncherDock: FC<Props> = ({ projectUuid, agents }) => {
    const dispatch = useAiAgentStoreDispatch();
    const { abort } = useAiAgentThreadStreamAbortController();
    const { dock, removeItem } = useLauncherDock(projectUuid);
    const activeThreadId = useAiAgentStoreSelector(
        (state) => state.aiAgentLauncher.activeThreadId,
    );
    const isPanelOpen = useAiAgentStoreSelector(
        (state) => state.aiAgentLauncher.mode === 'panel-open',
    );

    const agentsByUuid = useMemo(
        () => new Map(agents.map((a) => [a.uuid, a])),
        [agents],
    );

    if (dock.length === 0) return null;

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

    return (
        <div className={styles.dock}>
            {dock.map((item) => (
                <DockTab
                    key={item.threadId}
                    item={item}
                    agent={agentsByUuid.get(item.agentUuid) ?? null}
                    isActive={isPanelOpen && item.threadId === activeThreadId}
                    onSelect={handleSelect}
                    onClose={handleClose}
                />
            ))}
        </div>
    );
};
