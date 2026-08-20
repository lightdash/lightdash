import { ActionIcon, Button, Divider, Group, Tooltip } from '@mantine/core';
import {
    IconNotebook,
    IconSettings,
    IconShare2,
    IconTrash,
    IconWindowMinimize,
} from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useAgentSettingsLinkState } from '../../utils/agentSettingsNavigation';
import styles from './agentPageHeader.module.css';

type Props = {
    leftSection?: ReactNode;
    onMinimize?: () => void;
    onShare?: () => void;
    onDeleteThread?: () => void;
    onOpenMemories?: () => void;
    isSharing?: boolean;
    settingsHref?: string;
};

export const AgentPageHeader: FC<Props> = ({
    leftSection,
    onMinimize,
    onShare,
    onDeleteThread,
    onOpenMemories,
    isSharing,
    settingsHref,
}) => {
    const settingsLinkState = useAgentSettingsLinkState();
    const hasAgentActions = Boolean(onOpenMemories || settingsHref);

    return (
        <Group align="center" justify="space-between" className={styles.root}>
            <Group gap="sm">
                {leftSection}
                {leftSection && hasAgentActions && (
                    <Divider orientation="vertical" my={6} />
                )}
                {hasAgentActions && (
                    <Group gap={4}>
                        {onOpenMemories && (
                            <Button
                                variant="default"
                                className={styles.action}
                                data-tour="memories-header-button"
                                onClick={onOpenMemories}
                                leftSection={
                                    <MantineIcon
                                        icon={IconNotebook}
                                        size={14}
                                        stroke={1.8}
                                    />
                                }
                            >
                                Memories
                            </Button>
                        )}
                        {settingsHref && (
                            <Button
                                component={Link}
                                variant="default"
                                className={styles.action}
                                to={settingsHref}
                                state={settingsLinkState}
                                leftSection={
                                    <MantineIcon
                                        icon={IconSettings}
                                        size={14}
                                        stroke={1.8}
                                    />
                                }
                            >
                                Settings
                            </Button>
                        )}
                    </Group>
                )}
            </Group>
            <Group gap={4}>
                {onShare && (
                    <Tooltip label="Share thread" position="bottom">
                        <ActionIcon
                            variant="subtle"
                            color="ldGray"
                            className={styles.threadAction}
                            onClick={onShare}
                            loading={isSharing}
                            aria-label="Share thread"
                        >
                            <MantineIcon
                                icon={IconShare2}
                                size={16}
                                stroke={1.8}
                            />
                        </ActionIcon>
                    </Tooltip>
                )}
                {onDeleteThread && (
                    <Tooltip label="Delete thread" position="bottom">
                        <ActionIcon
                            variant="subtle"
                            color="ldGray"
                            className={styles.threadAction}
                            onClick={onDeleteThread}
                            aria-label="Delete thread"
                        >
                            <MantineIcon
                                icon={IconTrash}
                                size={16}
                                stroke={1.8}
                            />
                        </ActionIcon>
                    </Tooltip>
                )}
                {onMinimize && (
                    <Tooltip label="Minimize" position="bottom">
                        <ActionIcon
                            variant="subtle"
                            color="ldGray"
                            className={styles.threadAction}
                            onClick={onMinimize}
                            aria-label="Minimize"
                        >
                            <MantineIcon
                                icon={IconWindowMinimize}
                                size={16}
                                stroke={1.8}
                                className={styles.flippedIcon}
                            />
                        </ActionIcon>
                    </Tooltip>
                )}
            </Group>
        </Group>
    );
};
