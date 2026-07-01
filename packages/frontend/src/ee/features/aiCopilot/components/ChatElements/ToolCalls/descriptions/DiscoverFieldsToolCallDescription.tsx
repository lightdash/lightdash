import { rem, Text } from '@mantine-8/core';
import type { FC } from 'react';
import { ToolCallChip } from '../ToolCallChip';

/** @deprecated History-only description for old discoverFields tool calls. */
type DiscoverFieldsToolCallDescriptionProps = {
    userQuery: string;
};

/** @deprecated History-only description for old discoverFields tool calls. */
export const DiscoverFieldsToolCallDescription: FC<
    DiscoverFieldsToolCallDescriptionProps
> = ({ userQuery }) => (
    <Text c="dimmed" size="xs">
        Discovered fields for{' '}
        <ToolCallChip mx={rem(2)}>{userQuery}</ToolCallChip>
    </Text>
);
