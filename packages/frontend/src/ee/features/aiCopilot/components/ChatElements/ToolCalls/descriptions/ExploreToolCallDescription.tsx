import { rem, Text } from '@mantine/core';
import type { FC } from 'react';
import { ExploreChip } from '../ExploreChip';
import { ToolCallChip } from '../ToolCallChip';

type ExploreToolCallDescriptionProps = {
    exploreName: string | null;
    searchQuery: string | null;
};

export const ExploreToolCallDescription: FC<
    ExploreToolCallDescriptionProps
> = ({ exploreName, searchQuery }) => {
    return (
        <Text c="dimmed" size="xs">
            Searched relevant explores{' '}
            {searchQuery ? (
                <Text span>
                    <Text c="dimmed" size="xs" span>
                        matching query:
                    </Text>
                    <ToolCallChip mx={rem(2)}>"{searchQuery}"</ToolCallChip>
                </Text>
            ) : exploreName ? (
                <ExploreChip mx={rem(2)} exploreName={exploreName} />
            ) : null}
        </Text>
    );
};
