import { rem, Text } from '@mantine-8/core';
import type { FC } from 'react';
import { ToolCallChip } from '../ToolCallChip';

export const FieldImpactToolCallDescription: FC<{
    fieldId: string;
}> = ({ fieldId }) => {
    return (
        <Text c="dimmed" size="xs">
            Analyzed the impact of changing{' '}
            <ToolCallChip mx={rem(2)}>{fieldId}</ToolCallChip>
        </Text>
    );
};
