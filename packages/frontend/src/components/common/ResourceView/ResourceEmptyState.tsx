import { Box, Stack, Text, Title } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { type ResourceEmptyStateProps } from './types';

const ResourceEmptyState: FC<ResourceEmptyStateProps> = ({
    icon,
    title,
    description,
    action,
}) => {
    const { t } = useTranslation('resourceView');
    return (
        <Stack align="center" gap="md" py={40}>
            {icon && <Box c="ldGray.4">{icon}</Box>}

            <Stack align="center" gap={4}>
                <Title order={4} fw={500}>
                    {title ?? t('emptyState.noItems')}
                </Title>

                {description && <Text c="dimmed">{description}</Text>}
            </Stack>

            {action}
        </Stack>
    );
};

export default ResourceEmptyState;
