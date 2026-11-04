import { Box, Group, Stack, Text, Title } from '@mantine/core';
import { type FC, type PropsWithChildren, type ReactNode } from 'react';

type EmbedFormSectionProps = {
    title: string;
    description?: string;
    titleAddon?: ReactNode;
};

export const EmbedFormSection: FC<PropsWithChildren<EmbedFormSectionProps>> = ({
    title,
    description,
    titleAddon,
    children,
}) => (
    <Stack gap="sm">
        <Box>
            <Group gap="xs">
                <Title order={6}>{title}</Title>
                {titleAddon}
            </Group>
            {description && (
                <Text c="dimmed" fz="xs" mt="xxs">
                    {description}
                </Text>
            )}
        </Box>
        {children}
    </Stack>
);
