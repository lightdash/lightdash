import {
    SemanticLayerSortByDirection,
    type FieldType,
    type RawResultRow,
    type VizColumnsConfig,
} from '@lightdash/common';
import { Badge, Flex, Group, type FlexProps } from '@mantine/core';
import { IconArrowDown, IconArrowUp } from '@tabler/icons-react';
import { flexRender } from '@tanstack/react-table';
import { SMALL_TEXT_LENGTH } from '../../common/LightTable';
import MantineIcon from '../../common/MantineIcon';
import BodyCell from '../../common/Table/ScrollableTable/BodyCell';
import { VirtualizedArea } from '../../common/Table/ScrollableTable/TableBody';
import {
    Table as TableStyled,
    TABLE_HEADER_BG,
    Tr,
} from '../../common/Table/Table.styles';
import { useTableDataModel } from '../hooks/useTableDataModel';
import { type ResultsRunner } from '../transformers/ResultsRunner';

export type THConfig = {
    [fieldName: string]: {
        onClick: () => void;
        sortDirection: SemanticLayerSortByDirection | undefined;
        kind: FieldType;
    };
};

type TableProps<T extends ResultsRunner> = {
    columnsConfig: VizColumnsConfig;
    resultsRunner: T;
    flexProps?: FlexProps;
    thConfig?: THConfig;
};

export const Table = <T extends ResultsRunner>({
    resultsRunner,
    columnsConfig,
    flexProps,
    thConfig,
}: TableProps<T>) => {
    const {
        tableWrapperRef,
        getColumnsCount,
        getTableData,
        paddingTop,
        paddingBottom,
    } = useTableDataModel({
        config: {
            columns: columnsConfig,
        },
        resultsRunner,
    });

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
                            headerGroup.headers.map((header) => {
                                const headerOnClick =
                                    thConfig?.[header.id].onClick;

                                const sortDirection =
                                    thConfig?.[header.id].sortDirection;

                                return (
                                    <th
                                        key={header.id}
                                        onClick={headerOnClick}
                                        style={
                                            headerOnClick
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
                                        <Group spacing="two" fz={13}>
                                            {columnsConfig[header.id]
                                                ?.aggregation && (
                                                <Badge
                                                    size="sm"
                                                    color="indigo"
                                                    radius="xs"
                                                >
                                                    {
                                                        columnsConfig[header.id]
                                                            ?.aggregation
                                                    }
                                                </Badge>
                                            )}
                                            {/* TODO: do we need to check if it's a
                                        placeholder? */}
                                            {flexRender(
                                                header.column.columnDef.header,
                                                header.getContext(),
                                            )}

                                            {headerOnClick && sortDirection && (
                                                <MantineIcon
                                                    icon={
                                                        sortDirection ===
                                                        SemanticLayerSortByDirection.ASC
                                                            ? IconArrowUp
                                                            : IconArrowDown
                                                    }
                                                ></MantineIcon>
                                            )}
                                        </Group>
                                    </th>
                                );
                            }),
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
