import {
    type CustomDimension,
    type Field,
    type TableCalculation,
} from '@lightdash/common';
import { Menu, Text } from '@mantine-8/core';
import { IconCheck } from '@tabler/icons-react';
import { type FC } from 'react';
import {
    getSortDirectionOrder,
    getSortLabel,
    type SortDirection,
} from '../../../utils/sortUtils';
import MantineIcon from '../../common/MantineIcon';

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
            <Menu.Label>Sorting</Menu.Label>
            {getSortDirectionOrder(item).map((direction) => {
                const isActive = selectedDirection === direction;
                return (
                    <Menu.Item
                        key={direction}
                        leftSection={
                            isActive ? (
                                <MantineIcon icon={IconCheck} />
                            ) : undefined
                        }
                        disabled={isActive}
                        onClick={() => onSelect(direction)}
                    >
                        Sort{' '}
                        <Text span fz="inherit" lh="inherit" fw="bold">
                            {getSortLabel(item, direction)}
                        </Text>
                    </Menu.Item>
                );
            })}
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
