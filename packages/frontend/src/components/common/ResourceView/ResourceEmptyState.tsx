import { Box, Stack, Text, Title } from '@mantine-8/core';
import { type FC } from 'react';
import { type ResourceEmptyStateProps } from './types';

const ResourceEmptyState: FC<ResourceEmptyStateProps> = ({
    icon,
    title = 'No items',
    description,
    action,
}) => {
    return (
        <Stack align="center" gap="md" py={40}>
            {icon && <Box c="ldGray.4">{icon}</Box>}

            <Stack align="center" gap={4}>
                <Title order={4} fw={500}>
                    {title}
                </Title>

                {description && <Text c="ldGray.6">{description}</Text>}
            </Stack>

            {action}
        </Stack>
    );
};

export default ResourceEmptyState;
