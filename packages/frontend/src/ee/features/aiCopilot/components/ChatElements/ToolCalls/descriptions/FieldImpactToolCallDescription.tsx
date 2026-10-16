import { rem, Text } from '@mantine/core';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { ToolCallChip } from '../ToolCallChip';

export const FieldImpactToolCallDescription: FC<{
    fieldId: string;
}> = ({ fieldId }) => {
    const { t } = useTranslation('aiCopilotChat');
    return (
        <Text c="dimmed" size="xs">
            {t('toolDescriptions.analyzedImpactOf')}{' '}
            <ToolCallChip mx={rem(2)}>{fieldId}</ToolCallChip>
        </Text>
    );
};
