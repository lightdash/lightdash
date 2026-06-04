import { type ToolSearchSemanticLayerArgs } from '@lightdash/common';
import { rem, Text } from '@mantine-8/core';
import type { FC } from 'react';
import { ToolCallChip } from '../ToolCallChip';

type Props = Pick<ToolSearchSemanticLayerArgs, 'page' | 'searchQuery' | 'type'>;

const getFieldTypeLabel = (type: Props['type']) => {
    if (type === 'metric') return 'metrics';
    if (type === 'dimension') return 'dimensions';
    return 'fields';
};

export const SemanticLayerSearchToolCallDescription: FC<Props> = ({
    page,
    searchQuery,
    type,
}) => {
    const fieldTypeLabel = getFieldTypeLabel(type);
    const trimmedSearchQuery = searchQuery?.trim();

    return (
        <Text c="dimmed" size="xs">
            {trimmedSearchQuery ? (
                <>
                    Searched {fieldTypeLabel} for{' '}
                    <ToolCallChip mx={rem(2)}>
                        {trimmedSearchQuery}
                    </ToolCallChip>
                </>
            ) : (
                <>Listed {fieldTypeLabel}</>
            )}
            {page && page > 1 ? (
                <ToolCallChip mx={rem(2)}>page {page}</ToolCallChip>
            ) : null}
        </Text>
    );
};
