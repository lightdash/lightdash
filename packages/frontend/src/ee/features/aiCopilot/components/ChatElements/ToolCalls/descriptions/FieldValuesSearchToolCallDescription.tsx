import { rem, Text } from '@mantine/core';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { ToolCallChip } from '../ToolCallChip';

export const FieldValuesSearchToolCallDescription: FC<{
    fieldId: string;
    query: string | null;
}> = ({ fieldId, query }) => {
    const { t } = useTranslation('aiCopilotChat');
    return (
        <Text c="dimmed" size="xs">
            {t('toolDescriptions.searchedValuesInField')}{' '}
            <ToolCallChip mx={rem(2)}>{fieldId}</ToolCallChip>
            {query && (
                <>
                    {' '}
                    {t('toolDescriptions.matchingWord')}{' '}
                    <ToolCallChip mx={rem(2)}>"{query}"</ToolCallChip>
                </>
            )}
        </Text>
    );
};
