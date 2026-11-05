import {
    getItemId,
    type CustomDimension,
    type Field,
    type TableCalculation,
} from '@lightdash/common';
import { ActionIcon, Flex, Menu, Text } from '@mantine/core';
import { IconCheck, IconDots } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import {
    selectTileChartSorts,
    useDashboardSelector,
} from '../../features/dashboard/store';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    getSortDirectionOrder,
    getSortIcon,
    getSortLabel,
    SortDirection,
} from '../../utils/sortUtils';
import MantineIcon from '../common/MantineIcon';
import { type HeaderProps, type TableColumn } from '../common/Table/types';

type Props = {
    item: Field | TableCalculation | CustomDimension;
    tileUuid: string;
};

const ColumnHeaderSortMenuOptions: FC<Props> = ({ item, tileUuid }) => {
    const itemFieldId = getItemId(item);
    const tileSorts = useDashboardSelector((state) =>
        selectTileChartSorts(state, tileUuid),
    );
    const setTileChartSorts = useDashboardContext((c) => c.setTileChartSorts);

    const isSorted = (sortDirection: SortDirection) =>
        tileSorts.some(
            (sorts) =>
                sorts.fieldId === itemFieldId &&
                sorts.descending === (sortDirection === SortDirection.DESC),
        );
    return (
        <>
            {item &&
                getSortDirectionOrder(item).map((sortDirection) => (
                    <Menu.Item
                        key={sortDirection}
                        leftSection={
                            isSorted(sortDirection) ? (
                                <MantineIcon icon={IconCheck} />
                            ) : undefined
                        }
                        onClick={() => {
                            // Replace sortField for this tileUuid
                            // TODO update this code if you want to add multi-sorting
                            setTileChartSorts(tileUuid, [
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
            {tileSorts.some((sorts) => sorts.fieldId === itemFieldId) && (
                <>
                    <Menu.Divider />
                    <Menu.Item
                        color={'red'}
                        onClick={() => {
                            setTileChartSorts(tileUuid, []);
                        }}
                    >
                        Remove sort
                    </Menu.Item>
                </>
            )}
        </>
    );
};

const DashboardHeaderContextMenu: FC<HeaderProps & { tileUuid: string }> = ({
    header,
    tileUuid,
}) => {
    const meta = header.column.columnDef.meta as TableColumn['meta'];
    const item = meta?.item;
    const tileSorts = useDashboardSelector((state) =>
        selectTileChartSorts(state, tileUuid),
    );

    const iconSort = useMemo(() => {
        if (item === undefined) return undefined;

        const sort = tileSorts.find((s) => s.fieldId === getItemId(item));
        if (sort) {
            return getSortIcon(item, sort.descending);
        } else {
            return undefined;
        }
    }, [item, tileSorts]);
    if (item) {
        return (
            <Flex
                w="100%"
                justify="space-between"
                onClick={(e) => {
                    e.stopPropagation();
                }}
            >
                {' '}
                {
                    // Show the sort icon next to the title, and the dropdown menu on the right
                    iconSort ? <MantineIcon icon={iconSort} /> : <div></div>
                }
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
                            tileUuid={tileUuid}
                        />
                    </Menu.Dropdown>
                </Menu>
            </Flex>
        );
    } else {
        return null;
    }
};

export default DashboardHeaderContextMenu;
