import { type PivotChartData, type RawResultRow } from '@lightdash/common';
import { Flex, Group, type FlexProps } from '@mantine/core';
import { flexRender } from '@tanstack/react-table';
import { type FC } from 'react';
import { SMALL_TEXT_LENGTH } from '../../common/LightTable';
import BodyCell from '../../common/Table/ScrollableTable/BodyCell';
import { VirtualizedArea } from '../../common/Table/ScrollableTable/TableBody';
import {
    Table as TableStyled,
    TABLE_HEADER_BG,
    Tr,
} from '../../common/Table/Table.styles';
import useDataVizTable from '../hooks/useDataVizTable';

type Props = {
    transformedData: PivotChartData;
    flexProps?: FlexProps;
};

const ChartVizTransformedDataTable: FC<Props> = ({
    transformedData,
    flexProps,
}) => {
    const {
        tableWrapperRef,
        getColumnsCount,
        getTableData,
        paddingTop,
        paddingBottom,
    } = useDataVizTable(
        [
            ...(transformedData.indexColumn?.reference
                ? [transformedData.indexColumn.reference]
                : []),
            ...transformedData.valuesColumns,
        ],
        transformedData.results,
        {},
    );

    const columnsCount = getColumnsCount();
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
                                    <Group spacing="two">
                                        {flexRender(
                                            header.column.columnDef.header,
                                            header.getContext(),
                                        )}
                                    </Group>
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

export default ChartVizTransformedDataTable;
