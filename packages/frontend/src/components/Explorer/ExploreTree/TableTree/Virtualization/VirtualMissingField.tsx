import { ActionIcon, Group, Text, Tooltip } from '@mantine/core';
import { IconAlertTriangle, IconTrash } from '@tabler/icons-react';
import { memo, useCallback, type FC } from 'react';
import MantineIcon from '../../../../common/MantineIcon';
import type { MissingFieldItem } from './types';
import classes from './VirtualMissingField.module.css';

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
            className={classes.row}
        >
            <MantineIcon
                icon={IconAlertTriangle}
                color="yellow.9"
                className={classes.rowIcon}
            />

            <Text truncate size="sm" flex={1} miw={0}>
                {fieldId}
            </Text>

            <Tooltip
                label={
                    <Text size="xs" style={{ wordBreak: 'break-all' }}>
                        Remove missing field "{fieldId}".
                    </Text>
                }
                maw={300}
            >
                <ActionIcon
                    variant="transparent"
                    flex="0 0 auto"
                    onClick={handleClick}
                >
                    <MantineIcon icon={IconTrash} className={classes.rowIcon} />
                </ActionIcon>
            </Tooltip>
        </Group>
    );
};

const VirtualMissingField = memo(VirtualMissingFieldComponent);
VirtualMissingField.displayName = 'VirtualMissingField';

export default VirtualMissingField;
