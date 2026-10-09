import {
    DimensionType,
    SortByDirection,
    type IResultsRunner,
    type RawResultRow,
    type VizColumnsConfig,
    type VizTableHeaderSortConfig,
} from '@lightdash/common';
import {
    Flex,
    Group,
    Menu,
    type FlexProps,
    Badge,
    useMantineTheme,
} from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconCopy } from '@tabler/icons-react';
import { flexRender } from '@tanstack/react-table';
import { clsx } from 'clsx';
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
import styles from './Table.module.css';

const COMPACT_ROW_HEIGHT_PX = 28;

type TableDensity = 'default' | 'compact';

type TableProps<T extends IResultsRunner> = {
    columnsConfig: VizColumnsConfig;
    resultsRunner: T;
    flexProps?: FlexProps;
    thSortConfig?: VizTableHeaderSortConfig;
    onTHClick?: (fieldName: string) => void;
    enableJsonViewer?: boolean;
    /** `compact` is the dense monospace grid used for raw SQL results. */
    density?: TableDensity;
    /** Warehouse type per column: shown under the header name and used to
     *  right-align numbers. Only read by the compact variant. */
    columnTypes?: Record<string, DimensionType>;
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
    density = 'default',
    columnTypes = {},
}: TableProps<T>) => {
    const theme = useMantineTheme();
    const isCompact = density === 'compact';
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
        rowHeight: isCompact ? COMPACT_ROW_HEIGHT_PX : undefined,
    });

    // The compact grid prepends a row-index column.
    const columnsCount = getColumnsCount() + (isCompact ? 1 : 0);
    const { headerGroups, virtualRows, rowModelRows } = getTableData();

    return (
        <Flex
            ref={tableWrapperRef}
            direction="column"
            miw="100%"
            {...flexProps}
            style={{
                overflow: 'auto',
                fontFeatureSettings: "'tnum'",
                flexGrow: 1,
                ...(typeof flexProps?.style === 'object' &&
                !Array.isArray(flexProps.style)
                    ? flexProps.style
                    : {}),
            }}
            className="sentry-block ph-no-capture"
        >
            <TableStyled className={clsx(isCompact && styles.compact)}>
                <thead>
                    <tr>
                        {isCompact && (
                            <th
                                className={styles.rowIndex}
                                style={{
                                    backgroundColor: theme.colors.ldGray[0],
                                }}
                            >
                                #
                            </th>
                        )}
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
                                        <Group gap="two" fz="sm">
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
                                            {isCompact ? (
                                                <span
                                                    className={
                                                        styles.headerLabel
                                                    }
                                                >
                                                    {flexRender(
                                                        header.column.columnDef
                                                            .header,
                                                        header.getContext(),
                                                    )}
                                                    {columnTypes[header.id] && (
                                                        <span
                                                            className={
                                                                styles.columnType
                                                            }
                                                        >
                                                            {
                                                                columnTypes[
                                                                    header.id
                                                                ]
                                                            }
                                                        </span>
                                                    )}
                                                </span>
                                            ) : (
                                                flexRender(
                                                    header.column.columnDef
                                                        .header,
                                                    header.getContext(),
                                                )
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
                                {isCompact && (
                                    <td className={styles.rowIndex}>
                                        {index + 1}
                                    </td>
                                )}
                                {rowModelRows[index]
                                    .getVisibleCells()
                                    .map((cell) => {
                                        const cellValue =
                                            cell.getValue() as RawResultRow[0];
                                        const isNull =
                                            cellValue === null ||
                                            cellValue === undefined;

                                        return (
                                            <BodyCell
                                                key={cell.id}
                                                index={index}
                                                cell={cell}
                                                isNumericItem={
                                                    isCompact &&
                                                    columnTypes[
                                                        cell.column.id
                                                    ] === DimensionType.NUMBER
                                                }
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
                                                {cell.getIsPlaceholder() ? null : isCompact &&
                                                  isNull ? (
                                                    <span
                                                        className={
                                                            styles.nullValue
                                                        }
                                                    >
                                                        null
                                                    </span>
                                                ) : (
                                                    flexRender(
                                                        cell.column.columnDef
                                                            .cell,
                                                        cell.getContext(),
                                                    )
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
