import { type ToolFindContentArgsTransformed } from '@lightdash/common';
import { rem, Text } from '@mantine-8/core';
import type { FC } from 'react';
import { ToolCallChip } from '../ToolCallChip';

type ContentSearchToolCallDescriptionProps = {
    searchType: 'content' | 'dashboards' | 'charts';
    searchQueries: NonNullable<ToolFindContentArgsTransformed>['searchQueries'];
};

export const ContentSearchToolCallDescription: FC<
    ContentSearchToolCallDescriptionProps
> = ({ searchType, searchQueries }) => {
    const typeText = {
        content: 'content',
        dashboards: 'dashboards',
        charts: 'charts',
    }[searchType];

    return (
        <Text c="dimmed" size="xs">
            Searched for {typeText}{' '}
            {searchQueries.map((query) => (
                <ToolCallChip key={query.label} mx={rem(2)}>
                    {query.label}
                </ToolCallChip>
            ))}
        </Text>
    );
};
