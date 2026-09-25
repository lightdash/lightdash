import { Group, Stack, Text, Title } from '@mantine/core';
import { type FC, type ReactNode } from 'react';

type Props = {
    title: string;
    /** One line on what the subsection controls. */
    description?: ReactNode;
    /** Rendered next to the title, e.g. a beta badge. */
    badge?: ReactNode;
    /** Rendered at the far right of the header, e.g. a secondary button. */
    action?: ReactNode;
    children: ReactNode;
};

export const AgentSettingsSubsection: FC<Props> = ({
    title,
    description,
    badge,
    action,
    children,
}) => (
    <Stack gap="sm">
        <Group align="flex-start" justify="space-between" gap="md" wrap="wrap">
            <Stack gap={2} flex={1} miw={0}>
                <Group gap="xs" align="center">
                    <Title order={6} c="ldGray.7" size="sm" fw={500}>
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
            {action}
        </Group>
        {children}
    </Stack>
);
