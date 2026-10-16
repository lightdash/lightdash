import { rem, Text } from '@mantine/core';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { ToolCallChip } from '../ToolCallChip';

type DiscoverFieldsToolCallDescriptionProps = {
    userQuery: string;
};

export const DiscoverFieldsToolCallDescription: FC<
    DiscoverFieldsToolCallDescriptionProps
> = ({ userQuery }) => {
    const { t } = useTranslation('aiCopilotChat');
    return (
        <Text c="dimmed" size="xs">
            {t('toolDescriptions.discoveredFieldsFor')}{' '}
            <ToolCallChip mx={rem(2)}>{userQuery}</ToolCallChip>
        </Text>
    );
};
