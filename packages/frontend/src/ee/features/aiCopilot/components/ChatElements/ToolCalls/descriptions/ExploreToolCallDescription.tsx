import type { ToolFindExploresArgsTransformed } from '@lightdash/common';
import { Badge, rem, Text } from '@mantine-8/core';
import type { FC } from 'react';

type ExploreToolCallDescriptionProps = {
    exploreName: NonNullable<ToolFindExploresArgsTransformed>['exploreName'];
};

export const ExploreToolCallDescription: FC<
    ExploreToolCallDescriptionProps
> = ({ exploreName }) => {
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
        </Text>
    );
};
