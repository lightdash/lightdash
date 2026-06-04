import { rem, Text } from '@mantine-8/core';
import type { FC } from 'react';
import { ToolCallChip } from '../ToolCallChip';

type ListContentToolCallDescriptionProps = {
    page?: number | null;
    spaceSlug?: string | null;
};

export const ListContentToolCallDescription: FC<
    ListContentToolCallDescriptionProps
> = ({ page, spaceSlug }) => (
    <Text c="dimmed" size="xs">
        Listed {spaceSlug ? 'content in space' : 'root content'}{' '}
        {spaceSlug ? (
            <ToolCallChip mx={rem(2)}>{spaceSlug}</ToolCallChip>
        ) : null}
        {page && page > 1 ? (
            <ToolCallChip mx={rem(2)}>page {page}</ToolCallChip>
        ) : null}
    </Text>
);
