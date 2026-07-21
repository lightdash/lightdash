import { ActionIcon, Box, Button, Group, Menu, Tooltip } from '@mantine-8/core';
import {
    IconCode,
    IconDots,
    IconSettings,
    IconShare2,
    IconWindowMinimize,
} from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import styles from './agentPageHeader.module.css';

type Props = {
    leftSection?: ReactNode;
    onMinimize?: () => void;
    onShare?: () => void;
    onViewAsCode?: () => void;
    isSharing?: boolean;
    settingsHref?: string;
};

export const AgentPageHeader: FC<Props> = ({
    leftSection,
    onMinimize,
    onShare,
    onViewAsCode,
    isSharing,
    settingsHref,
}) => (
    <Group align="center" justify="space-between" className={styles.root}>
        <Box>{leftSection}</Box>
        <Group gap={4}>
            {onShare && (
                <Tooltip label="Share thread" position="bottom">
                    <ActionIcon
                        variant="default"
                        className={styles.action}
                        onClick={onShare}
                        loading={isSharing}
                        aria-label="Share thread"
                    >
                        <MantineIcon icon={IconShare2} size={14} stroke={1.8} />
                    </ActionIcon>
                </Tooltip>
            )}
            {onMinimize && (
                <Button
                    variant="default"
                    className={styles.action}
                    onClick={onMinimize}
                    leftSection={
                        <MantineIcon
                            icon={IconWindowMinimize}
                            size={14}
                            stroke={1.8}
                            className={styles.flippedIcon}
                        />
                    }
                >
                    Minimize
                </Button>
            )}
            {settingsHref && (
                <Button
                    component={Link}
                    variant="default"
                    className={styles.action}
                    to={settingsHref}
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
            {onViewAsCode && (
                <Menu position="bottom-end" withArrow withinPortal shadow="md">
                    <Menu.Target>
                        <ActionIcon
                            variant="default"
                            size="md"
                            radius="md"
                            className={`${styles.action} ${styles.actionIcon}`}
                            aria-label="More actions"
                        >
                            <MantineIcon icon={IconDots} />
                        </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                        <Menu.Label>Content as code</Menu.Label>
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconCode} />}
                            onClick={onViewAsCode}
                        >
                            View as code
                        </Menu.Item>
                    </Menu.Dropdown>
                </Menu>
            )}
        </Group>
    </Group>
);
