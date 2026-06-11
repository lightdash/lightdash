import { rem, Text } from '@mantine-8/core';
import type { FC } from 'react';
import { ToolCallChip } from '../ToolCallChip';

export const FieldValuesSearchToolCallDescription: FC<{
    fieldId: string;
    query: string | null;
}> = ({ fieldId, query }) => {
    return (
        <Text c="dimmed" size="xs">
            Searched for values in field{' '}
            <ToolCallChip mx={rem(2)}>{fieldId}</ToolCallChip>
            {query && (
                <>
                    {' '}
                    matching <ToolCallChip mx={rem(2)}>"{query}"</ToolCallChip>
                </>
            )}
        </Text>
    );
};
