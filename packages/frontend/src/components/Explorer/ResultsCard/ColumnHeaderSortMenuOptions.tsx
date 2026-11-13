import {
    type CustomDimension,
    type Field,
    type TableCalculation,
} from '@lightdash/common';
import { Box, Menu, Text } from '@mantine/core';
import { type FC } from 'react';
import {
    getSortDirectionOrder,
    getSortLabel,
    type SortDirection,
} from '../../../utils/sortUtils';
import classes from './ColumnHeaderSortMenuOptions.module.css';

type Props = {
    item: Field | TableCalculation | CustomDimension;
    selectedDirection: SortDirection | undefined;
    onSelect: (direction: SortDirection) => void;
    /** When provided and a direction is active, renders a "Remove sort" item. */
    onRemove?: () => void;
};

const ColumnHeaderSortMenuOptions: FC<Props> = ({
    item,
    selectedDirection,
    onSelect,
    onRemove,
}) => {
    return (
        <>
            <Box className={classes.row}>
                <Text fz="xs" c="dimmed">
                    Sort
                </Text>
                <Box className={classes.segments}>
                    {getSortDirectionOrder(item).map((direction) => {
                        const label = getSortLabel(item, direction);
                        const isActive = selectedDirection === direction;
                        return (
                            <Menu.Item
                                key={direction}
                                className={classes.segment}
                                aria-label={`Sort ${label}`}
                                aria-current={isActive || undefined}
                                data-active={isActive || undefined}
                                onClick={() => {
                                    if (!isActive) onSelect(direction);
                                }}
                            >
                                {label}
                            </Menu.Item>
                        );
                    })}
                </Box>
            </Box>
            {onRemove && selectedDirection !== undefined && (
                <>
                    <Menu.Divider />
                    <Menu.Item color="red" onClick={onRemove}>
                        Remove sort
                    </Menu.Item>
                </>
            )}
        </>
    );
};

export default ColumnHeaderSortMenuOptions;
