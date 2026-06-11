import { rem, Text } from '@mantine-8/core';
import type { FC } from 'react';
import { ToolCallChip } from '../ToolCallChip';

type DiscoverFieldsToolCallDescriptionProps = {
    userQuery: string;
};

export const DiscoverFieldsToolCallDescription: FC<
    DiscoverFieldsToolCallDescriptionProps
> = ({ userQuery }) => (
    <Text c="dimmed" size="xs">
        Discovered fields for{' '}
        <ToolCallChip mx={rem(2)}>{userQuery}</ToolCallChip>
    </Text>
);
