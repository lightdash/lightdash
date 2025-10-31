import { Group, Text } from '@mantine/core';
import { memo, useMemo, type FC } from 'react';
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
    const { label, color, depth } = item.data;

    // Apply indentation based on depth (matches tree node padding formula)
    const pl = useMemo(() => {
        return `${12 + (depth ?? 0) * 20}px`;
    }, [depth]);

    return (
        <Group mt="sm" mb="xs" pl={pl}>
            <Text fw={600} c={color}>
                {label}
            </Text>
        </Group>
    );
};

const VirtualSectionHeader = memo(VirtualSectionHeaderComponent);
VirtualSectionHeader.displayName = 'VirtualSectionHeader';

export default VirtualSectionHeader;
