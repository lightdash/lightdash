import {
    getItemId,
    type CustomDimension,
    type Field,
    type SortField,
    type TableCalculation,
} from '@lightdash/common';
import { Menu } from '@mantine-8/core';
import { ActionIcon, Flex, Text } from '@mantine/core';
import { IconCheck, IconChevronDown } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import {
    getSortDirectionOrder,
    getSortIcon,
    getSortLabel,
    SortDirection,
} from '../../utils/sortUtils';
import MantineIcon from '../common/MantineIcon';
import { type HeaderProps, type TableColumn } from '../common/Table/types';

type ColumnHeaderSortMenuOptionsProps = {
    item: Field | TableCalculation | CustomDimension;
    sorts: SortField[];
    onSortChange: (sorts: SortField[]) => void;
};

const ColumnHeaderSortMenuOptions: FC<ColumnHeaderSortMenuOptionsProps> = ({
    item,
    sorts,
    onSortChange,
}) => {
    const itemFieldId = getItemId(item);

    const isSorted = (sortDirection: SortDirection) =>
        sorts.some(
            (sort) =>
                sort.fieldId === itemFieldId &&
                sort.descending === (sortDirection === SortDirection.DESC),
        );

    return (
        <>
            {getSortDirectionOrder(item).map((sortDirection) => (
                <Menu.Item
                    key={sortDirection}
                    leftSection={
                        isSorted(sortDirection) ? (
                            <MantineIcon icon={IconCheck} />
                        ) : undefined
                    }
                    onClick={() => {
                        onSortChange([
                            {
                                fieldId: itemFieldId,
                                descending:
                                    sortDirection === SortDirection.DESC,
                            },
                        ]);
                    }}
                >
                    Sort{' '}
                    <Text span fw={500}>
                        {getSortLabel(item, sortDirection)}
                    </Text>
                </Menu.Item>
            ))}
            {sorts.some((sort) => sort.fieldId === itemFieldId) && (
                <>
                    <Menu.Divider />
                    <Menu.Item
                        color="red"
                        onClick={() => {
                            onSortChange([]);
                        }}
                    >
                        Remove sort
                    </Menu.Item>
                </>
            )}
        </>
    );
};

type UnderlyingDataHeaderContextMenuProps = HeaderProps & {
    sorts: SortField[];
    onSortChange: (sorts: SortField[]) => void;
};

const UnderlyingDataHeaderContextMenu: FC<
    UnderlyingDataHeaderContextMenuProps
> = ({ header, sorts, onSortChange }) => {
    const meta = header.column.columnDef.meta as TableColumn['meta'];
    const item = meta?.item;

    const iconSort = useMemo(() => {
        if (item === undefined) return undefined;

        const sort = sorts.find((s) => s.fieldId === getItemId(item));
        if (sort) {
            return getSortIcon(item, sort.descending);
        }
        return undefined;
    }, [item, sorts]);

    if (item) {
        return (
            <Flex
                w="100%"
                justify="space-between"
                onClick={(e) => {
                    e.stopPropagation();
                }}
            >
                {iconSort ? <MantineIcon icon={iconSort} /> : <div />}
                <Menu withinPortal withArrow shadow="md">
                    <Menu.Target>
                        <ActionIcon size="xs" variant="light" bg="transparent">
                            <MantineIcon icon={IconChevronDown} />
                        </ActionIcon>
                    </Menu.Target>

                    <Menu.Dropdown>
                        <ColumnHeaderSortMenuOptions
                            item={item}
                            sorts={sorts}
                            onSortChange={onSortChange}
                        />
                    </Menu.Dropdown>
                </Menu>
            </Flex>
        );
    }
    return null;
};

export default UnderlyingDataHeaderContextMenu;
