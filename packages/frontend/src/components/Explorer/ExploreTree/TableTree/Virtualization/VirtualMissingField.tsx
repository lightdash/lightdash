import { Group, Text, Tooltip } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { memo, type FC } from 'react';
import MantineIcon from '../../../../common/MantineIcon';
import type { MissingFieldItem } from './types';

interface VirtualMissingFieldProps {
    item: MissingFieldItem;
}

/**
 * Renders a missing field alert in the virtualized tree
 * TODO: Wire up click handler in integration phase (PR5)
 */
const VirtualMissingFieldComponent: FC<VirtualMissingFieldProps> = ({
    item,
}) => {
    const { fieldId } = item.data;

    return (
        <Tooltip
            withinPortal
            label={`Field ${fieldId} not found on this chart. Click here to remove it.`}
            position="bottom-start"
            maw={700}
        >
            <Group ml={12} my="xs" style={{ cursor: 'pointer' }}>
                <MantineIcon
                    icon={IconAlertTriangle}
                    color="yellow.9"
                    style={{ flexShrink: 0 }}
                />
                <Text truncate>{fieldId}</Text>
            </Group>
        </Tooltip>
    );
};

const VirtualMissingField = memo(VirtualMissingFieldComponent);
VirtualMissingField.displayName = 'VirtualMissingField';

export default VirtualMissingField;
