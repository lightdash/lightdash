import { Center, Text } from '@mantine/core';
import { memo, type FC } from 'react';
import type { EmptyStateItem } from './types';

interface VirtualEmptyStateProps {
    item: EmptyStateItem;
}

/**
 * Renders an empty state message in the virtualized tree
 */
const VirtualEmptyStateComponent: FC<VirtualEmptyStateProps> = ({ item }) => {
    const { message } = item.data;

    return (
        <Center pt="sm" pb="md">
            <Text c="dimmed">{message}</Text>
        </Center>
    );
};

const VirtualEmptyState = memo(VirtualEmptyStateComponent);
VirtualEmptyState.displayName = 'VirtualEmptyState';

export default VirtualEmptyState;
