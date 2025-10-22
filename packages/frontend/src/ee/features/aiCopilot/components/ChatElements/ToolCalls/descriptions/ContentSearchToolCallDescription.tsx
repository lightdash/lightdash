import { type ToolFindContentArgsTransformed } from '@lightdash/common';
import { Badge, rem, Text } from '@mantine-8/core';
import type { FC } from 'react';

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
                <Badge
                    key={query.label}
                    color="gray"
                    variant="light"
                    size="xs"
                    mx={rem(2)}
                    radius="sm"
                    style={{
                        textTransform: 'none',
                        fontWeight: 400,
                    }}
                >
                    {query.label}
                </Badge>
            ))}
        </Text>
    );
};
