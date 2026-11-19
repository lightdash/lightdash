import {
    getItemId,
    type CustomDimension,
    type Field,
    type ResultRow,
    type SortField,
    type TableCalculation,
} from '@lightdash/common';
import { ActionIcon, Flex, Menu, Text } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { IconCheck, IconCopy, IconDots } from '@tabler/icons-react';
import { useCallback, useMemo, type FC } from 'react';
import useToaster from '../../hooks/toaster/useToaster';
import {
    getSortDirectionOrder,
    getSortIcon,
    getSortLabel,
    SortDirection,
} from '../../utils/sortUtils';
import MantineIcon from '../common/MantineIcon';
import { type HeaderProps, type TableColumn } from '../common/Table/types';
import { getColumnValuesText } from './getColumnValuesText';

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
    rows: ResultRow[];
    sorts: SortField[];
    onSortChange: (sorts: SortField[]) => void;
};

const UnderlyingDataHeaderContextMenu: FC<
    UnderlyingDataHeaderContextMenuProps
> = ({ header, rows, sorts, onSortChange }) => {
    const meta = header.column.columnDef.meta as TableColumn['meta'];
    const item = meta?.item;
    const columnId = header.column.id;
    const clipboard = useClipboard({ timeout: 2000 });
    const { showToastSuccess } = useToaster();

    const iconSort = useMemo(() => {
        if (item === undefined) return undefined;

        const sort = sorts.find((s) => s.fieldId === getItemId(item));
        if (sort) {
            return getSortIcon(item, sort.descending);
        }
        return undefined;
    }, [item, sorts]);

    const handleCopyColumn = useCallback(() => {
        clipboard.copy(getColumnValuesText(rows, columnId));
        showToastSuccess({
            title: `Copied ${rows.length} ${
                rows.length === 1 ? 'value' : 'values'
            } to clipboard!`,
        });
    }, [clipboard, rows, columnId, showToastSuccess]);

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
                <Menu withArrow>
                    <Menu.Target>
                        <ActionIcon
                            size="xs"
                            variant="light"
                            color="gray"
                            bg="transparent"
                            aria-label="Context menu"
                        >
                            <MantineIcon icon={IconDots} />
                        </ActionIcon>
                    </Menu.Target>

                    <Menu.Dropdown>
                        <ColumnHeaderSortMenuOptions
                            item={item}
                            sorts={sorts}
                            onSortChange={onSortChange}
                        />
                        <Menu.Divider />
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconCopy} />}
                            disabled={rows.length === 0}
                            onClick={handleCopyColumn}
                        >
                            Copy column
                        </Menu.Item>
                    </Menu.Dropdown>
                </Menu>
            </Flex>
        );
    }
    return null;
};

export default UnderlyingDataHeaderContextMenu;
