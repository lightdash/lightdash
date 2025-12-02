import { Badge, rem, Text } from '@mantine-8/core';
import type { FC } from 'react';

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
                        "{searchQuery}"
                    </Badge>
                </Text>
            ) : exploreName ? (
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
            ) : null}
        </Text>
    );
};
