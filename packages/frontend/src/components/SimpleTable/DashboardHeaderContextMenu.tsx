import {
    CustomDimension,
    Field,
    getItemId,
    SortField,
    TableCalculation,
} from '@lightdash/common';
import { ActionIcon, Menu } from '@mantine/core';
import { IconCheck, IconChevronDown } from '@tabler/icons-react';
import { FC } from 'react';
import MantineIcon from '../common/MantineIcon';
import { HeaderProps, TableColumn } from '../common/Table/types';

import { useDashboardContext } from '../../providers/DashboardProvider';
import { getSortDirectionOrder, getSortLabel } from '../../utils/sortUtils';
import { BolderLabel } from '../Explorer/ResultsCard/ColumnHeaderContextMenu.styles';

export enum SortDirection {
    ASC = 'ASC',
    DESC = 'DESC',
}

type Props = {
    item: Field | TableCalculation | CustomDimension;
    sort: SortField | undefined;
    tileUuid: string;
};

const ColumnHeaderSortMenuOptions: FC<Props> = ({ item, tileUuid, sort }) => {
    const itemFieldId = getItemId(item);
    const hasSort = !!sort;
    const selectedSortDirection = sort
        ? sort.descending
            ? SortDirection.DESC
            : SortDirection.ASC
        : undefined;

    const chartSort = useDashboardContext((c) => c.chartSort);
    const setChartSort = useDashboardContext((c) => c.setChartSort);

    return (
        <>
            {item &&
                getSortDirectionOrder(item).map((sortDirection) => (
                    <Menu.Item
                        key={sortDirection}
                        icon={
                            hasSort &&
                            selectedSortDirection === sortDirection ? (
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
        </>
    );
};

const DashboardHeaderContextMenu: FC<HeaderProps & { tileUuid: string }> = ({
    header,
    tileUuid,
}) => {
    const meta = header.column.columnDef.meta as TableColumn['meta'];

    if (meta && meta.item) {
        return (
            <div
                onClick={(e) => {
                    e.stopPropagation();
                }}
            >
                <Menu withinPortal withArrow>
                    <Menu.Target>
                        <ActionIcon size="xs" variant="light" bg="transparent">
                            <MantineIcon icon={IconChevronDown} />
                        </ActionIcon>
                    </Menu.Target>

                    <Menu.Dropdown>
                        <ColumnHeaderSortMenuOptions
                            item={meta.item}
                            sort={meta?.sort?.sort}
                            tileUuid={tileUuid}
                        />
                    </Menu.Dropdown>
                </Menu>
            </div>
        );
    } else {
        return null;
    }
};

export default DashboardHeaderContextMenu;
