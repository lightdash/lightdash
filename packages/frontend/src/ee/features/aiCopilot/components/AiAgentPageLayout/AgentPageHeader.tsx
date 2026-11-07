import { ActionIcon, Divider, Group, Tooltip } from '@mantine/core';
import {
    IconNotebook,
    IconSettings,
    IconShare2,
    IconWindowMinimize,
} from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useAgentMaxWidth } from '../../hooks/useAgentMaxWidth';
import { useAgentSettingsLinkState } from '../../utils/agentSettingsNavigation';
import styles from './agentPageHeader.module.css';

type Props = {
    leftSection?: ReactNode;
    onMinimize?: () => void;
    onShare?: () => void;
    onOpenMemories?: () => void;
    isSharing?: boolean;
    settingsHref?: string;
};

export const AgentPageHeader: FC<Props> = ({
    leftSection,
    onMinimize,
    onShare,
    onOpenMemories,
    isSharing,
    settingsHref,
}) => {
    const settingsLinkState = useAgentSettingsLinkState();
    const isMobile = useAgentMaxWidth(768, {
        getInitialValueInEffect: false,
    });
    // Memories and minimize are desktop affordances — the mobile header only
    // has room for the agent selector, sidebar toggle and share.
    const showMemories = Boolean(onOpenMemories) && !isMobile;
    const showMinimize = Boolean(onMinimize) && !isMobile;
    const showSettings = Boolean(settingsHref) && !isMobile;
    const hasAgentActions = showMemories || showSettings;
    const hasThreadActions = Boolean(onShare) || showMinimize;

    return (
        <Group
            align="center"
            justify="space-between"
            wrap="nowrap"
            className={styles.root}
        >
            <Group gap="sm" wrap="nowrap" miw={0}>
                {!isMobile && leftSection}
            </Group>
            <Group gap={2} wrap="nowrap" className={styles.actions}>
                {showMemories && (
                    <Tooltip label="Memories" position="bottom">
                        <ActionIcon
                            className={styles.threadAction}
                            data-tour="memories-header-button"
                            onClick={onOpenMemories}
                            aria-label="Memories"
                        >
                            <MantineIcon
                                icon={IconNotebook}
                                size={16}
                                stroke={1.8}
                            />
                        </ActionIcon>
                    </Tooltip>
                )}
                {showSettings && settingsHref && (
                    <Tooltip label="Agent settings" position="bottom">
                        <ActionIcon
                            component={Link}
                            className={styles.threadAction}
                            to={settingsHref}
                            state={settingsLinkState}
                            aria-label="Agent settings"
                            // Anchor for scope walkthroughs (data-tour-via)
                            data-tour-anchor="agent-settings"
                            data-tour-hint="Open the agent's settings"
                        >
                            <MantineIcon
                                icon={IconSettings}
                                size={16}
                                stroke={1.8}
                            />
                        </ActionIcon>
                    </Tooltip>
                )}
                {hasAgentActions && hasThreadActions && (
                    <Divider
                        orientation="vertical"
                        className={styles.divider}
                    />
                )}
                {onShare && (
                    <Tooltip label="Share thread" position="bottom">
                        <ActionIcon
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
                {showMinimize && (
                    <Tooltip label="Minimize" position="bottom">
                        <ActionIcon
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
