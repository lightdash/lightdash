import { Group, Text, Tooltip } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { memo, useCallback, type FC } from 'react';
import MantineIcon from '../../../../common/MantineIcon';
import type { MissingFieldItem } from './types';

interface VirtualMissingFieldProps {
    item: MissingFieldItem;
    onRemove: (fieldId: string, isDimension: boolean) => void;
}

/**
 * Renders a missing field alert in the virtualized tree
 */
const VirtualMissingFieldComponent: FC<VirtualMissingFieldProps> = ({
    item,
    onRemove,
}) => {
    const { fieldId, isDimension } = item.data;

    const handleClick = useCallback(() => {
        onRemove(fieldId, isDimension);
    }, [onRemove, fieldId, isDimension]);

    return (
        <Tooltip
            withinPortal
            label={`Field ${fieldId} not found on this chart. Click here to remove it.`}
            position="bottom-start"
            maw={700}
        >
            <Group
                onClick={handleClick}
                ml={12}
                my="xs"
                noWrap
                style={{ cursor: 'pointer' }}
            >
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
