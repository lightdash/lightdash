import {
    CustomDimension,
    Field,
    getItemId,
    TableCalculation,
} from '@lightdash/common';
import { ActionIcon, Flex, Menu } from '@mantine/core';
import { IconCheck, IconChevronDown } from '@tabler/icons-react';
import { FC, useMemo } from 'react';
import MantineIcon from '../common/MantineIcon';
import { HeaderProps, TableColumn } from '../common/Table/types';

import { useDashboardContext } from '../../providers/DashboardProvider';
import {
    getSortDirectionOrder,
    getSortIcon,
    getSortLabel,
    SortDirection,
} from '../../utils/sortUtils';
import { BolderLabel } from '../Explorer/ResultsCard/ColumnHeaderContextMenu.styles';

type Props = {
    item: Field | TableCalculation | CustomDimension;
    tileUuid: string;
};

const ColumnHeaderSortMenuOptions: FC<Props> = ({ item, tileUuid }) => {
    const itemFieldId = getItemId(item);
    const chartSort = useDashboardContext((c) => c.chartSort);
    const setChartSort = useDashboardContext((c) => c.setChartSort);

    const isSorted = (sortDirection: SortDirection) =>
        chartSort[tileUuid]?.some(
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
                        icon={
                            isSorted(sortDirection) ? (
                                <MantineIcon icon={IconCheck} />
                            ) : undefined
                        }
                        onClick={() => {
                            // Replace sortField for this tileUuid
                            // TODO update this code if you want to add multi-sorting
                            setChartSort({
                                ...chartSort,
                                [tileUuid]: [
                                    {
                                        fieldId: itemFieldId,
                                        descending:
                                            sortDirection ===
                                            SortDirection.DESC,
                                    },
                                ],
                            });
                        }}
                    >
                        Sort{' '}
                        <BolderLabel>
                            {getSortLabel(item, sortDirection)}
                        </BolderLabel>
                    </Menu.Item>
                ))}
            {chartSort[tileUuid]?.some(
                (sorts) => sorts.fieldId === itemFieldId,
            ) && (
                <>
                    <Menu.Divider />
                    <Menu.Item
                        color={'red'}
                        onClick={() => {
                            setChartSort({
                                ...chartSort,
                                [tileUuid]: [],
                            });
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
    const chartSort = useDashboardContext((c) => c.chartSort);

    const iconSort = useMemo(() => {
        if (item === undefined) return undefined;

        const sort = chartSort[tileUuid]?.find(
            (s) => s.fieldId === getItemId(item),
        );
        if (sort) {
            return getSortIcon(item, sort.descending);
        } else {
            return undefined;
        }
    }, [item, chartSort, tileUuid]);
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
                <Menu withinPortal withArrow>
                    <Menu.Target>
                        <ActionIcon size="xs" variant="light" bg="transparent">
                            <MantineIcon icon={IconChevronDown} />
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
