import { type AiAgentSummary } from '@lightdash/common';
import { ActionIcon, Loader, ScrollArea } from '@mantine/core';
import { IconPlus, IconX } from '@tabler/icons-react';
import {
    useEffect,
    useRef,
    type FC,
    type KeyboardEvent,
    type MouseEvent,
} from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { type LauncherDockItem } from '../../store/aiAgentLauncherSlice';
import { useAiAgentThreadStreaming } from '../../streaming/useAiAgentThreadStreamQuery';
import styles from './AiAgentsLauncher.module.css';
import {
    getLauncherAgentUuid,
    type LauncherSelectedAgent,
} from './launcherAgentSelection';
import { useLauncherDockThreads } from './useLauncherDockThreads';

const ThreadTab: FC<{
    item: LauncherDockItem;
    isActive: boolean;
    onSelect: (item: LauncherDockItem) => void;
    onClose: (threadId: string) => void;
}> = ({ item, isActive, onSelect, onClose }) => {
    const isStreaming = useAiAgentThreadStreaming(item.threadId);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isActive) return;
        ref.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }, [isActive]);

    const handleClose = (e: MouseEvent) => {
        e.stopPropagation();
        onClose(item.threadId);
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(item);
        }
    };

    return (
        <div
            ref={ref}
            role="button"
            tabIndex={0}
            title={item.title}
            aria-current={isActive ? 'true' : undefined}
            className={`${styles.panelTab} ${isActive ? styles.panelTabActive : ''}`}
            onClick={() => onSelect(item)}
            onKeyDown={handleKeyDown}
        >
            {isStreaming && <Loader size={10} color="gray" />}
            <span className={styles.panelTabTitle}>{item.title}</span>
            <ActionIcon
                size="xs"
                onClick={handleClose}
                aria-label="Close thread"
                className={styles.panelTabClose}
            >
                <MantineIcon icon={IconX} size={12} />
            </ActionIcon>
        </div>
    );
};

type Props = {
    projectUuid: string;
    agent: LauncherSelectedAgent;
    agents: AiAgentSummary[];
};

export const PanelThreadTabs: FC<Props> = ({ projectUuid, agent, agents }) => {
    const {
        visibleDock,
        isThreadActive,
        isNewThreadActive,
        selectThread,
        closeThread,
        startNewThread,
    } = useLauncherDockThreads({ projectUuid, agents });
    const agentUuid = getLauncherAgentUuid(agent);

    if (visibleDock.length === 0) return null;

    return (
        <div className={styles.panelTabs}>
            <ScrollArea
                type="hover"
                scrollbars="x"
                scrollbarSize={4}
                className={styles.panelTabsScroller}
            >
                <div className={styles.panelTabsList}>
                    {visibleDock.map((item) => (
                        <ThreadTab
                            key={item.threadId}
                            item={item}
                            isActive={isThreadActive(item)}
                            onSelect={selectThread}
                            onClose={closeThread}
                        />
                    ))}
                </div>
            </ScrollArea>
            {agentUuid && (
                <ActionIcon
                    size="sm"
                    onClick={() => startNewThread(agentUuid)}
                    disabled={isNewThreadActive}
                    aria-label="New thread"
                >
                    <MantineIcon icon={IconPlus} size={14} />
                </ActionIcon>
            )}
        </div>
    );
};
