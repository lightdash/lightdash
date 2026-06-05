import { Box, Button, Group } from '@mantine-8/core';
import { IconSettings, IconWindowMinimize } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import styles from './agentPageHeader.module.css';

type Props = {
    leftSection?: ReactNode;
    onMinimize?: () => void;
    settingsHref?: string;
};

export const AgentPageHeader: FC<Props> = ({
    leftSection,
    onMinimize,
    settingsHref,
}) => (
    <Group align="center" justify="space-between" className={styles.root}>
        <Box>{leftSection}</Box>
        <Group gap={4}>
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
