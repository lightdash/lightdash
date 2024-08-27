import {
    type ResultRow,
    type SqlTableConfig,
    type TableChartSqlConfig,
} from '@lightdash/common';
import { Flex } from '@mantine/core';
import { flexRender } from '@tanstack/react-table';
import { type FC } from 'react';
import { SMALL_TEXT_LENGTH } from '../../common/LightTable';
import BodyCell from '../../common/Table/ScrollableTable/BodyCell';
import { VirtualizedArea } from '../../common/Table/ScrollableTable/TableBody';
import {
    Table as TableStyled,
    TableContainer,
    TABLE_HEADER_BG,
    Tr,
} from '../../common/Table/Table.styles';
import { useTableDataModel } from '../transformers/useTableDataModel';

type Props = {
    data: ResultRow[];
    config?: TableChartSqlConfig | SqlTableConfig;
};

export const Table: FC<Props> = ({ data, config }) => {
    const {
        tableWrapperRef,
        getColumnsCount,
        getTableData,
        paddingTop,
        paddingBottom,
    } = useTableDataModel(data, config);

    const columnsCount = getColumnsCount();
    const { headerGroups, virtualRows, rowModelRows } = getTableData();

    return (
        <TableContainer $shouldExpand>
            <Flex
                ref={tableWrapperRef}
                dir="column"
                miw="100%"
                sx={{
                    flex: 1,
                    overflow: 'auto',
                }}
            >
                <TableStyled>
                    <thead>
                        <tr>
                            {headerGroups.map((headerGroup) =>
                                headerGroup.headers.map((header) => (
                                    <th
                                        key={header.id}
                                        style={{
                                            backgroundColor: TABLE_HEADER_BG,
                                        }}
                                    >
                                        {/* TODO: do we need to check if it's a
                                        placeholder? */}
                                        {flexRender(
                                            header.column.columnDef.header,
                                            header.getContext(),
                                        )}
                                    </th>
                                )),
                            )}
                        </tr>
                    </thead>
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
                                            const cellValue =
                                                cell.getValue() as
                                                    | ResultRow[0]
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
                                                            cellValue?.value
                                                                ?.formatted ||
                                                            ''
                                                        ).length >
                                                        SMALL_TEXT_LENGTH
                                                    }
                                                >
                                                    {cell.getIsPlaceholder()
                                                        ? null
                                                        : flexRender(
                                                              cell.column
                                                                  .columnDef
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
        </TableContainer>
    );
};
