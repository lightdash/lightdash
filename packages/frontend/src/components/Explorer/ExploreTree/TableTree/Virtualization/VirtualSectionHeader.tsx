import { Group, Text } from '@mantine/core';
import { memo, type FC } from 'react';
import type { SectionHeaderItem } from './types';

interface VirtualSectionHeaderProps {
    item: SectionHeaderItem;
}

/**
 * Renders a section header (Dimensions, Metrics, etc.) in the virtualized tree
 */
const VirtualSectionHeaderComponent: FC<VirtualSectionHeaderProps> = ({
    item,
}) => {
    const { label, color } = item.data;

    return (
        <Group mt="sm" mb="xs">
            <Text fw={600} c={color}>
                {label}
            </Text>
        </Group>
    );
};

const VirtualSectionHeader = memo(VirtualSectionHeaderComponent);
VirtualSectionHeader.displayName = 'VirtualSectionHeader';

export default VirtualSectionHeader;
