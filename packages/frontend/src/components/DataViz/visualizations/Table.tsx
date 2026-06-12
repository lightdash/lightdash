import {
    SortByDirection,
    type IResultsRunner,
    type RawResultRow,
    type VizColumnsConfig,
    type VizTableHeaderSortConfig,
} from '@lightdash/common';
import { Menu } from '@mantine-8/core';
import {
    Badge,
    Flex,
    Group,
    useMantineTheme,
    type FlexProps,
} from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconCopy } from '@tabler/icons-react';
import { flexRender } from '@tanstack/react-table';
import useToaster from '../../../hooks/toaster/useToaster';
import { JsonCellMenuItem } from '../../common/JsonViewer/JsonCellViewer';
import {
    getJsonCellValue,
    getJsonLikeString,
} from '../../common/JsonViewer/utils';
import { SMALL_TEXT_LENGTH } from '../../common/LightTable/constants';
import MantineIcon from '../../common/MantineIcon';
import BodyCell from '../../common/Table/ScrollableTable/BodyCell';
import { VirtualizedArea } from '../../common/Table/ScrollableTable/TableBody';
import { Table as TableStyled, Tr } from '../../common/Table/Table.styles';
import { type CellContextMenuProps } from '../../common/Table/types';
import { useTableDataModel } from '../hooks/useTableDataModel';

type TableProps<T extends IResultsRunner> = {
    columnsConfig: VizColumnsConfig;
    resultsRunner: T;
    flexProps?: FlexProps;
    thSortConfig?: VizTableHeaderSortConfig;
    onTHClick?: (fieldName: string) => void;
    enableJsonViewer?: boolean;
};

const SqlRunnerCellContextMenu = ({
    cell,
    onViewJsonCell,
}: CellContextMenuProps) => {
    const { showToastSuccess } = useToaster();
    const value = cell.getValue();
    const jsonValue = getJsonCellValue(value) ?? getJsonLikeString(value);

    return (
        <>
            <Menu.Item
                leftSection={<MantineIcon icon={IconCopy} />}
                onClick={() => {
                    void navigator.clipboard?.writeText(String(value ?? ''));
                    showToastSuccess({ title: 'Copied to clipboard!' });
                }}
            >
                Copy value
            </Menu.Item>

            {jsonValue && onViewJsonCell ? (
                <JsonCellMenuItem onClick={() => onViewJsonCell(jsonValue)} />
            ) : null}
        </>
    );
};

export const Table = <T extends IResultsRunner>({
    resultsRunner,
    columnsConfig,
    flexProps,
    thSortConfig,
    onTHClick,
    enableJsonViewer = false,
}: TableProps<T>) => {
    const theme = useMantineTheme();
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
        enableJsonViewer,
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
                fontFeatureSettings: "'tnum'",
                flexGrow: 1,
                ...(typeof flexProps?.sx === 'object' &&
                !Array.isArray(flexProps.sx)
                    ? flexProps.sx
                    : {}),
            }}
            className="sentry-block ph-no-capture"
        >
            <TableStyled>
                <thead>
                    <tr>
                        {headerGroups.map((headerGroup) =>
                            headerGroup.headers.map((header) => {
                                const sortConfig = thSortConfig?.[header.id];
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
                                                          theme.colors
                                                              .ldGray[0],
                                                  }
                                                : {
                                                      backgroundColor:
                                                          theme.colors
                                                              .ldGray[0],
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
                                        const cellValue =
                                            cell.getValue() as RawResultRow[0];

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
                                                cellContextMenu={
                                                    enableJsonViewer
                                                        ? SqlRunnerCellContextMenu
                                                        : undefined
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
