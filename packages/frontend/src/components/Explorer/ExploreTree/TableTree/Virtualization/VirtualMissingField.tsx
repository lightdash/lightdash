import { ActionIcon, Group, Text, Tooltip } from '@mantine-8/core';
import { IconAlertTriangle, IconTrash } from '@tabler/icons-react';
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
        <Group
            ml={32}
            mr={16}
            my="xs"
            gap="xs"
            wrap="nowrap"
            style={{ overflow: 'hidden' }}
        >
            <MantineIcon
                icon={IconAlertTriangle}
                color="yellow.9"
                style={{ flexShrink: 0 }}
            />

            <Text truncate size="sm" style={{ flex: 1, minWidth: 0 }}>
                {fieldId}
            </Text>

            <Tooltip
                withinPortal
                label={
                    <Text size="xs" style={{ wordBreak: 'break-all' }}>
                        Remove missing field "{fieldId}".
                    </Text>
                }
                maw={300}
                multiline
            >
                <ActionIcon
                    color="gray"
                    variant="transparent"
                    style={{ flexShrink: 0 }}
                    onClick={handleClick}
                >
                    <MantineIcon icon={IconTrash} style={{ flexShrink: 0 }} />
                </ActionIcon>
            </Tooltip>
        </Group>
    );
};

const VirtualMissingField = memo(VirtualMissingFieldComponent);
VirtualMissingField.displayName = 'VirtualMissingField';

export default VirtualMissingField;
