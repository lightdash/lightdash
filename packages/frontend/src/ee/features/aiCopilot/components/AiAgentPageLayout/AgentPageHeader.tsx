import { ActionIcon, Button, Divider, Group, Tooltip } from '@mantine/core';
import {
    IconNotebook,
    IconSettings,
    IconShare2,
    IconWindowMinimize,
} from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('aiAgent');
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

    return (
        <Group align="center" justify="space-between" className={styles.root}>
            <Group gap="sm">
                {!isMobile && leftSection}
                {!isMobile && leftSection && hasAgentActions && (
                    <Divider orientation="vertical" my={6} />
                )}
                {hasAgentActions && (
                    <Group gap={4}>
                        {showMemories && (
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
                                {t('header.memories')}
                            </Button>
                        )}
                        {showSettings && settingsHref && (
                            <Button
                                component={Link}
                                variant="default"
                                className={styles.action}
                                to={settingsHref}
                                state={settingsLinkState}
                                // Anchor for scope walkthroughs (data-tour-via)
                                data-tour-anchor="agent-settings"
                                data-tour-hint="Open the agent's settings"
                                leftSection={
                                    <MantineIcon
                                        icon={IconSettings}
                                        size={14}
                                        stroke={1.8}
                                    />
                                }
                            >
                                {t('header.settings')}
                            </Button>
                        )}
                    </Group>
                )}
            </Group>
            <Group gap={4}>
                {onShare && (
                    <Tooltip label={t('header.shareThread')} position="bottom">
                        <ActionIcon
                            color="ldGray"
                            className={styles.threadAction}
                            onClick={onShare}
                            loading={isSharing}
                            aria-label={t('header.shareThread')}
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
                    <Tooltip label={t('header.minimize')} position="bottom">
                        <ActionIcon
                            color="ldGray"
                            className={styles.threadAction}
                            onClick={onMinimize}
                            aria-label={t('header.minimize')}
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
