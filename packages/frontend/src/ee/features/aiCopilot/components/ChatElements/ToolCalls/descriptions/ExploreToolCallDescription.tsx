import type { ToolFindExploresArgsTransformed } from '@lightdash/common';
import { Badge, rem, Text } from '@mantine-8/core';
import type { FC } from 'react';

type ExploreToolCallDescriptionProps = {
    exploreName: NonNullable<ToolFindExploresArgsTransformed>['exploreName'];
    searchQuery: string | undefined;
};

export const ExploreToolCallDescription: FC<
    ExploreToolCallDescriptionProps
> = ({ exploreName, searchQuery }) => {
    return (
        <Text c="dimmed" size="xs">
            Searched relevant explores{' '}
            {exploreName && (
                <Badge
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
                    {exploreName}
                </Badge>
            )}
            {searchQuery && (
                <Text span>
                    <Text c="dimmed" size="xs" span>
                        matching
                    </Text>
                    <Badge
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
                        {searchQuery}
                    </Badge>
                </Text>
            )}
        </Text>
    );
};
