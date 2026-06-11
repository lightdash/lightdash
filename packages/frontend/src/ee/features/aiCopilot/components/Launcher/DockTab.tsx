import { type AiAgentSummary } from '@lightdash/common';
import { ActionIcon, Group, Loader, Text } from '@mantine-8/core';
import { IconX } from '@tabler/icons-react';
import { type FC, type KeyboardEvent, type MouseEvent } from 'react';
import { LightdashUserAvatar } from '../../../../../components/Avatar';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { type LauncherDockItem } from '../../store/aiAgentLauncherSlice';
import { useAiAgentThreadStreaming } from '../../streaming/useAiAgentThreadStreamQuery';
import styles from './AiAgentsLauncher.module.css';

type Props = {
    item: LauncherDockItem;
    agent: AiAgentSummary | null;
    isActive: boolean;
    onSelect: (item: LauncherDockItem) => void;
    onClose: (threadId: string) => void;
};

export const DockTab: FC<Props> = ({
    item,
    agent,
    isActive,
    onSelect,
    onClose,
}) => {
    const isStreaming = useAiAgentThreadStreaming(item.threadId);

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
            role="button"
            tabIndex={0}
            title={item.title}
            className={`${styles.dockTab} ${isActive ? styles.dockTabActive : ''} ${isStreaming ? styles.dockTabStreaming : ''}`}
            onClick={() => onSelect(item)}
            onKeyDown={handleKeyDown}
        >
            <Group gap="xs" wrap="nowrap" w="100%">
                {isStreaming ? (
                    <Loader size={12} color="gray" />
                ) : (
                    <LightdashUserAvatar
                        size="xs"
                        name={agent?.name ?? 'AI'}
                        src={agent?.imageUrl}
                    />
                )}
                <Text size="sm" className={styles.dockTabTitle}>
                    {item.title}
                </Text>
                <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="xs"
                    onClick={handleClose}
                    aria-label="Close conversation"
                    className={isActive ? undefined : styles.dockTabCloseButton}
                >
                    <MantineIcon icon={IconX} size={14} />
                </ActionIcon>
            </Group>
        </div>
    );
};
