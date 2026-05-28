import { Box, Button, Group } from '@mantine-8/core';
import { IconSettings, IconWindowMinimize } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';

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
    <Group align="center" justify="space-between">
        <Box>{leftSection}</Box>
        <Group gap="xs">
            {onMinimize && (
                <Button
                    variant="default"
                    onClick={onMinimize}
                    leftSection={
                        <MantineIcon
                            icon={IconWindowMinimize}
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
                    to={settingsHref}
                    leftSection={<MantineIcon icon={IconSettings} />}
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
