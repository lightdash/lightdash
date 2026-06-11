import { ActionIcon, Box, Button, Group, Tooltip } from '@mantine-8/core';
import {
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
    isSharing?: boolean;
    settingsHref?: string;
};

export const AgentPageHeader: FC<Props> = ({
    leftSection,
    onMinimize,
    onShare,
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
                        styles={(theme) => ({
                            root: {
                                borderColor: theme.colors.ldGray[2],
                                boxShadow: `var(--mantine-shadow-subtle)`,
                                color: theme.colors.ldGray[9],
                            },
                        })}
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
                            style={{ transform: 'scaleX(-1)' }}
                        />
                    }
                    styles={(theme) => ({
                        root: {
                            borderColor: theme.colors.ldGray[2],
                            boxShadow: `var(--mantine-shadow-subtle)`,
                            color: theme.colors.ldGray[9],
                            fontSize: theme.fontSizes.xs,
                        },
                    })}
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
                    styles={(theme) => ({
                        root: {
                            borderColor: theme.colors.ldGray[2],
                            boxShadow: `var(--mantine-shadow-subtle)`,
                            color: theme.colors.ldGray[9],
                            fontSize: theme.fontSizes.xs,
                        },
                    })}
                >
                    Settings
                </Button>
            )}
        </Group>
    </Group>
);
