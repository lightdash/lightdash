import { Group, Paper, Stack, Text, Title } from '@mantine/core';
import { type Icon as TablerIcon } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import classes from './AgentSettingsSection.module.css';

type Props = {
    /** Anchor target for the settings section index. */
    id: string;
    icon: TablerIcon;
    title: string;
    /** One line on what the section controls. */
    description?: ReactNode;
    /** Rendered next to the title, e.g. a beta badge. */
    badge?: ReactNode;
    /** Rendered at the far right of the header, e.g. a secondary button. */
    action?: ReactNode;
    children: ReactNode;
};

export const AgentSettingsSection: FC<Props> = ({
    id,
    icon,
    title,
    description,
    badge,
    action,
    children,
}) => (
    <Paper component="section" id={id} p="xl" className={classes.root}>
        <Stack gap="md">
            <Group
                align="flex-start"
                justify="space-between"
                gap="md"
                wrap="wrap"
            >
                <Group align="flex-start" gap="xs" wrap="nowrap">
                    <Paper p="xxs" withBorder radius="sm">
                        <MantineIcon icon={icon} size="md" />
                    </Paper>
                    <Stack gap={2}>
                        <Group gap="xs" align="center">
                            <Title order={5} c="ldGray.9" fw={700}>
                                {title}
                            </Title>
                            {badge}
                        </Group>
                        {description && (
                            <Text size="xs" c="dimmed">
                                {description}
                            </Text>
                        )}
                    </Stack>
                </Group>
                {action}
            </Group>
            {children}
        </Stack>
    </Paper>
);
