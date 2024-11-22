import {
    SortByDirection,
    type RawResultRow,
    type VizColumnsConfig,
    type VizTableHeaderSortConfig,
} from '@lightdash/common';
import { Badge, Flex, Group, Tooltip, type FlexProps } from '@mantine/core';
import { IconArrowDown, IconArrowUp } from '@tabler/icons-react';
import { flexRender } from '@tanstack/react-table';
import { useMemo } from 'react';
import { SMALL_TEXT_LENGTH } from '../../common/LightTable';
import MantineIcon from '../../common/MantineIcon';
import BodyCell from '../../common/Table/ScrollableTable/BodyCell';
import { VirtualizedArea } from '../../common/Table/ScrollableTable/TableBody';
import {
    Table as TableStyled,
    TABLE_HEADER_BG,
    Tr,
} from '../../common/Table/Table.styles';
import { useVirtualTable } from '../hooks/useVirtualTable';

type TableProps = {
    columnNames: string[];
    rows: RawResultRow[];
    columnsConfig?: VizColumnsConfig;
    flexProps?: FlexProps;
    thSortConfig?: VizTableHeaderSortConfig;
    onTHClick?: (fieldName: string) => void;
};

// This is a simple table that is set up to be virtualized from basically
// just rows and columns. It is currently used to render the table data from charts.
// TODO: Ideally we could use this for what DataViz/Table is doing and
// not use a TableDataModel within that
export const ChartDataTable = ({
    columnNames,
    rows,
    columnsConfig,
    flexProps,
    thSortConfig,
    onTHClick,
}: TableProps) => {
    const { tableWrapperRef, getTableData, paddingTop, paddingBottom } =
        useVirtualTable({ columnNames, rows, config: columnsConfig });

    const columnsCount = useMemo(() => columnNames.length, [columnNames]);
    const { headerGroups, virtualRows, rowModelRows } = getTableData();

    return (
        <Flex
            ref={tableWrapperRef}
            direction="column"
            miw="100%"
            {...flexProps}
            sx={{
                overflow: 'auto',
                fontFamily: "'Inter', sans-serif",
                fontFeatureSettings: "'tnum'",
                flexGrow: 1,
                ...flexProps?.sx,
            }}
            className="sentry-block ph-no-capture"
        >
            <TableStyled>
                <Tooltip.Group>
                    <thead>
                        <tr>
                            {headerGroups.map((headerGroup) =>
                                headerGroup.headers.map((header) => {
                                    const sortConfig =
                                        thSortConfig?.[header.id];
                                    const onClick =
                                        sortConfig && onTHClick
                                            ? () => onTHClick(header.id)
                                            : undefined;

                                    return (
                                        <th
                                            key={header.id}
                                            onClick={onClick}
                                            style={
                                                onClick
                                                    ? {
                                                          cursor: 'pointer',
                                                          backgroundColor:
                                                              TABLE_HEADER_BG,
                                                      }
                                                    : {
                                                          backgroundColor:
                                                              TABLE_HEADER_BG,
                                                      }
                                            }
                                        >
                                            <Tooltip
                                                label="You cannot sort by a group column"
                                                disabled={!!onClick}
                                                position="top"
                                                withinPortal
                                            >
                                                <Group spacing="two" fz={13}>
                                                    {columnsConfig?.[header.id]
                                                        ?.aggregation && (
                                                        <Badge
                                                            size="sm"
                                                            color="indigo"
                                                            radius="xs"
                                                        >
                                                            {
                                                                columnsConfig?.[
                                                                    header.id
                                                                ]?.aggregation
                                                            }
                                                        </Badge>
                                                    )}

                                                    {flexRender(
                                                        header.column.columnDef
                                                            .header,
                                                        header.getContext(),
                                                    )}

                                                    {onClick &&
                                                        sortConfig?.direction && (
                                                            <MantineIcon
                                                                icon={
                                                                    sortConfig.direction ===
                                                                    SortByDirection.ASC
                                                                        ? IconArrowUp
                                                                        : IconArrowDown
                                                                }
                                                            ></MantineIcon>
                                                        )}
                                                </Group>
                                            </Tooltip>
                                        </th>
                                    );
                                }),
                            )}
                        </tr>
                    </thead>
                </Tooltip.Group>
                <tbody>
                    {paddingTop > 0 && (
                        <VirtualizedArea
                            cellCount={columnsCount}
                            padding={paddingTop}
                        />
                    )}
                    {virtualRows.map(({ index }) => {
                        return (
                            <Tr key={index} $index={index}>
                                {rowModelRows[index]
                                    .getVisibleCells()
                                    .map((cell) => {
                                        const cellValue = cell.getValue() as
                                            | RawResultRow[0]
                                            | undefined;

                                        return (
                                            <BodyCell
                                                key={cell.id}
                                                index={index}
                                                cell={cell}
                                                isNumericItem={false}
                                                hasData={!!cellValue}
                                                isLargeText={
                                                    (
                                                        cellValue?.toString() ||
                                                        ''
                                                    ).length > SMALL_TEXT_LENGTH
                                                }
                                            >
                                                {cell.getIsPlaceholder()
                                                    ? null
                                                    : flexRender(
                                                          cell.column.columnDef
                                                              .cell,
                                                          cell.getContext(),
                                                      )}
                                            </BodyCell>
                                        );
                                    })}
                            </Tr>
                        );
                    })}
                    {paddingBottom > 0 && (
                        <VirtualizedArea
                            cellCount={columnsCount}
                            padding={paddingBottom}
                        />
                    )}
                </tbody>
            </TableStyled>
        </Flex>
    );
};
