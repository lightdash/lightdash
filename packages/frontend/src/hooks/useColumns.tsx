import {
    convertFormattedValue,
    DimensionType,
    formatItemValue,
    getErrorMessage,
    getItemId,
    getItemMap,
    getMetricOverridesWithPopInheritance,
    isCustomDimension,
    isDimension,
    isField,
    isMetric,
    isNumericItem,
    isResultValue,
    renderRichTextTemplate,
    renderTemplatedUrl,
    type AdditionalMetric,
    type CustomDimension,
    type Dimension,
    type Field,
    type ItemsMap,
    type Metric,
    type ParametersValuesMap,
    type RawResultRow,
    type ResultRow,
    type ResultValue,
    type TableCalculation,
} from '@lightdash/common';
import { Group, Tooltip } from '@mantine/core';
import { IconExclamationCircle } from '@tabler/icons-react';
import { type CellContext } from '@tanstack/react-table';
import omit from 'lodash/omit';
import { useMemo } from 'react';
import { JsonCellPreview } from '../components/common/JsonViewer/JsonCellViewer';
import {
    getJsonCellValue,
    getJsonLikeString,
} from '../components/common/JsonViewer/utils';
import MantineIcon from '../components/common/MantineIcon';
import {
    BrokenImageCell,
    ImageCell,
} from '../components/common/Table/ImageCell';
import RichTextCell from '../components/common/Table/RichTextCell';
import {
    TableHeaderBoldLabel,
    TableHeaderLabelContainer,
    TableHeaderRegularLabel,
} from '../components/common/Table/Table.styles';
import {
    columnHelper,
    type TableColumn,
} from '../components/common/Table/types';
import { formatRowValueFromWarehouse } from '../components/DataViz/formatters/formatRowValueFromWarehouse';
import {
    selectAdditionalMetrics,
    selectCustomDimensions,
    selectMetricOverrides,
    selectParameters,
    selectTimezone,
    selectSorts,
    selectTableCalculations,
    selectTableName,
    useExplorerSelector,
} from '../features/explorer/store';
import { getFieldColors } from '../utils/fieldColors';
import { TableCellBar } from './TableCellBar';
import { useAsyncCalculateTotal } from './useAsyncCalculateTotal';
import { useExplore } from './useExplore';
import { useExplorerQuery } from './useExplorerQuery';

export { getJsonCellValue, getJsonLikeString };

export const formatCellContent = (
    data?: { value: ResultValue },
    item?: Field | AdditionalMetric | TableCalculation | CustomDimension,
    parameters?: ParametersValuesMap,
) => {
    if (!data) return '-';

    // Only re-format on frontend when there are parameters and the format uses them
    // Otherwise, use the pre-formatted value from backend
    const hasParameterFormat =
        item &&
        'format' in item &&
        typeof item.format === 'string' &&
        (item.format.includes('${ld.parameters') ||
            item.format.includes('${lightdash.parameters'));

    if (hasParameterFormat && parameters) {
        return formatItemValue(item, data.value.raw, false, parameters);
    }

    // Use backend-formatted value by default
    return data.value.formatted ?? '-';
};

// Results-grid cell value. DATE/TIMESTAMP dimensions use the backend
// pre-formatted value (already in the resolved project tz) to avoid re-parsing
// UTC strings on the frontend. Everything else (metrics, table calculations,
// numbers) is formatted on the frontend to support metric overrides / parameter
// formats — and is passed the resolved `timezone` so temporal metrics render in
// the project timezone, not the browser's.
export const formatResultsTableCell = (
    data: { value: ResultValue } | undefined,
    item:
        | Field
        | AdditionalMetric
        | TableCalculation
        | CustomDimension
        | undefined,
    parameters: ParametersValuesMap | undefined,
    timezone: string | undefined,
): string => {
    if (!data) return '-';

    if (
        isField(item) &&
        (item.type === DimensionType.DATE ||
            item.type === DimensionType.TIMESTAMP)
    ) {
        return data.value.formatted;
    }

    return formatItemValue(item, data.value.raw, false, parameters, timezone);
};

const getResultJsonCellValue = (
    cellValue: { value: ResultValue } | undefined,
) => {
    if (!cellValue) return;

    const rawJsonValue = getJsonCellValue(cellValue.value.raw);
    if (rawJsonValue) return rawJsonValue;

    return getJsonLikeString(cellValue.value.raw);
};

const isBarDisplay = (
    info:
        | CellContext<ResultRow, { value: ResultValue }>
        | CellContext<RawResultRow, string>,
) => {
    const minMaxMap = info.table?.options.meta?.minMaxMap;
    const columnProperties = info.table?.options.meta?.columnProperties;

    // For pivot tables, get the base field ID from the item in meta
    // This is needed because pivoted columns have different IDs than the base field
    const item = info.column.columnDef.meta?.item;
    const baseFieldId = item ? getItemId(item) : info.column.id;
    const displayStyle = columnProperties?.[baseFieldId]?.displayStyle;

    return minMaxMap && displayStyle === 'bar';
};

const formatBarDisplayCell = (
    info:
        | CellContext<ResultRow, { value: ResultValue }>
        | CellContext<RawResultRow, string>,
    parameters?: ParametersValuesMap,
) => {
    const cellValue = info.getValue();
    const columnId = info.column.id;
    const columnProperties = info.table?.options.meta?.columnProperties;
    const minMaxMap = info.table?.options.meta?.minMaxMap;

    // For pivot tables, get the base field ID from the item in meta
    // This is needed because pivoted columns have different IDs than the base field
    const item = info.column.columnDef.meta?.item;
    const baseFieldId = item ? getItemId(item) : columnId;

    const color =
        columnProperties?.[baseFieldId]?.color ??
        columnProperties?.[columnId]?.color;

    let formatted, value: number;

    if (isResultValue(cellValue)) {
        // Parse value - numeric metrics may return strings from the database (e.g., "1" for count_distinct)
        const rawValue = cellValue.value.raw;
        value = typeof rawValue === 'number' ? rawValue : Number(rawValue);
        formatted = cellValue.value.formatted;

        // Only render bar if value is a valid number
        if (Number.isNaN(value)) {
            return formatCellContent(cellValue, item, parameters);
        }
    } else {
        value = Number(cellValue);
        formatted = formatRowValueFromWarehouse(cellValue);
    }

    // Get min/max from minMaxMap (same as conditional formatting)
    // For pivot tables, try baseFieldId first so all pivoted versions share the same scale
    // Fall back to columnId for individual column scales
    const minMax = minMaxMap[baseFieldId] ?? minMaxMap[columnId];

    // Don't render bars if minMaxMap is missing for this field
    // Fallback values (0, 100) cause incorrect scaling for percentage values stored as decimals
    if (!minMax) {
        // Handle both ResultRow and RawResultRow formats
        if (isResultValue(cellValue)) {
            return formatCellContent(cellValue, item, parameters);
        } else {
            // For raw string values, return formatted value
            return <span>{formatted}</span>;
        }
    }

    // Convert value for percentage fields (multiply decimal by 100 to match min/max scale)
    // This ensures percentage values stored as decimals (0.05) are properly scaled
    // to match the min/max values calculated by convertFormattedValue (5, 15)
    const convertedValue = convertFormattedValue(value, item);
    const numericConvertedValue =
        typeof convertedValue === 'number' ? convertedValue : value;

    return (
        <TableCellBar
            value={numericConvertedValue}
            formatted={formatted}
            min={minMax.min}
            max={minMax.max}
            color={color}
        />
    );
};

const formatRichTextCell = (
    item: Dimension | Metric,
    info:
        | CellContext<ResultRow, { value: ResultValue }>
        | CellContext<RawResultRow, string>,
) => {
    const cellValue = info.getValue();

    // Extract the value
    if (!isResultValue(cellValue)) {
        // Return empty/null display if not a proper ResultValue
        return <span style={{ color: '#999' }}>-</span>;
    }

    const value = (cellValue as { value: ResultValue }).value;

    // Build row context for templating
    const row = info.row
        ? info.row
              .getAllCells()
              .reduce<Record<string, Record<string, ResultValue>>>(
                  (acc, rowCell) => {
                      const cellItem = rowCell.column.columnDef.meta?.item;
                      const rowCellValue = rowCell.getValue();

                      // Handle both ResultRow and RawResultRow formats
                      const cellResultValue = isResultValue(rowCellValue)
                          ? (rowCellValue as { value: ResultValue }).value
                          : {
                                raw: rowCellValue,
                                formatted: String(rowCellValue),
                            };

                      if (cellItem && isField(cellItem) && cellResultValue) {
                          acc[cellItem.table] = acc[cellItem.table] || {};
                          acc[cellItem.table][cellItem.name] = cellResultValue;
                      }
                      return acc;
                  },
                  {},
              )
        : {};

    try {
        // Process the template with LiquidJS
        // eslint-disable-next-line testing-library/render-result-naming-convention
        const processedContent = renderRichTextTemplate(
            item.richText || '',
            value,
            row,
        );

        return <RichTextCell content={processedContent} />;
    } catch (error) {
        const errorMessage =
            error instanceof Error ? error.message : String(error);
        // Don't log "undefined variable" errors - these are expected when templates
        // reference fields that don't exist in the current context
        if (!errorMessage.includes('undefined variable')) {
            console.error(
                `Error processing rich text template for ${item.name}: ${errorMessage}`,
                { template: item.richText, value, row },
            );
        }
        // Fall back to plain formatted value
        return <span>{value.formatted}</span>;
    }
};

const formatImageCell = (
    item: Dimension,
    info:
        | CellContext<ResultRow, { value: ResultValue }>
        | CellContext<RawResultRow, string>,
) => {
    // Extract value from cell
    const cellValue = info.getValue();
    const value: ResultValue = isResultValue(cellValue)
        ? cellValue.value
        : { raw: cellValue, formatted: String(cellValue) };

    const urlTemplate = item.image?.url || '';

    // Only extract row data if template references other fields
    // Skip expensive getAllCells() for simple templates like "${value.raw}"
    const needsRowContext =
        urlTemplate.includes('${') &&
        !urlTemplate.match(/^\$\{value\.(raw|formatted)\}$/);

    // TODO optimization opportunity:
    // extract row at a row level (not per cell) , not at a cell level, if the row contains at least 1 image.
    // this will optimize rows with more than 2 images
    // we'll have to refactor the existing code to pass this parsed row info

    // Build row data similar to UrlMenuItem (only when needed)
    const row = needsRowContext
        ? info.row
              .getAllCells()
              .reduce<Record<string, Record<string, ResultValue>>>(
                  (acc, rowCell) => {
                      const cellItem = rowCell.column.columnDef.meta?.item;
                      const rowCellValue = rowCell.getValue();

                      // Handle both ResultRow and RawResultRow formats
                      const cellResultValue = isResultValue(rowCellValue)
                          ? (rowCellValue as { value: ResultValue }).value
                          : {
                                raw: rowCellValue,
                                formatted: String(rowCellValue),
                            };

                      if (cellItem && isField(cellItem) && cellResultValue) {
                          acc[cellItem.table] = acc[cellItem.table] || {};
                          acc[cellItem.table][cellItem.name] = cellResultValue;
                      }
                      return acc;
                  },
                  {},
              )
        : {};

    try {
        // Render the templated URL with row context
        // eslint-disable-next-line testing-library/render-result-naming-convention
        const processedUrl = renderTemplatedUrl(
            item.image?.url || '',
            value,
            row,
        );
        // Validate image url
        const imageUrl = new URL(processedUrl);
        if (!['http:', 'https:'].includes(imageUrl.protocol)) {
            console.error(`Invalid image protocol "${processedUrl}"`);
            return (
                <BrokenImageCell
                    imageUrl={processedUrl}
                    error={`Invalid image protocol`}
                />
            );
        }

        return <ImageCell item={item} imageUrl={imageUrl.href} />;
    } catch (error) {
        console.error(
            `Invalid image URL template "${item.image?.url}": ${error}`,
        );
        return (
            <BrokenImageCell
                imageUrl={item.image?.url || (value.raw as string)}
                error={getErrorMessage(error) as string}
            />
        );
    }
};

export const getFormattedValueCell = (
    info: CellContext<ResultRow, { value: ResultValue }>,
    parameters?: ParametersValuesMap,
    options?: { enableJsonViewer?: boolean },
) => {
    const cellValue = info.getValue();
    const item = info.column.columnDef.meta?.item;

    try {
        if (isBarDisplay(info)) return formatBarDisplayCell(info, parameters);
    } catch (error) {
        console.error(`Unable to format value for bar display cell ${error}`);
    }

    // Check if this is a rich text field (highest priority for both dimensions and metrics)
    // Skip if cellValue is null/undefined (except for explicit null handling in templates)
    if (item && (isDimension(item) || isMetric(item)) && item.richText) {
        return formatRichTextCell(item, info);
    }

    // Check if this is an image dimension
    if (item && isDimension(item) && item.image?.url && cellValue) {
        return formatImageCell(item, info);
    }

    if (options?.enableJsonViewer) {
        const jsonValue = getResultJsonCellValue(cellValue);
        if (jsonValue) {
            return <JsonCellPreview value={jsonValue} />;
        }
    }

    return formatCellContent(cellValue, item, parameters);
};

const getJsonFormattedValueCell = (
    info: CellContext<ResultRow, { value: ResultValue }>,
    parameters?: ParametersValuesMap,
) => getFormattedValueCell(info, parameters, { enableJsonViewer: true });

export const getValueCell = (
    info: CellContext<RawResultRow, string>,
    parameters?: ParametersValuesMap,
    options?: { enableJsonViewer?: boolean },
) => {
    const value = info.getValue();

    try {
        if (isBarDisplay(info)) return formatBarDisplayCell(info, parameters);
    } catch (error) {
        console.error(`Unable to get value for bar display cell ${error}`);
    }

    // Check if this is a rich text field (highest priority for both dimensions and metrics)
    const item = info.column.columnDef.meta?.item;
    if (item && (isDimension(item) || isMetric(item)) && item.richText) {
        return formatRichTextCell(item, info);
    }

    // Check if this is an image dimension
    if (item && isDimension(item) && item.image?.url) {
        return formatImageCell(item, info);
    }

    if (options?.enableJsonViewer) {
        const jsonValue = getJsonCellValue(value) ?? getJsonLikeString(value);
        if (jsonValue) {
            return <JsonCellPreview value={jsonValue} />;
        }
    }

    // Default text rendering
    const formatted = formatRowValueFromWarehouse(value);
    return <span>{formatted}</span>;
};

export const getJsonValueCell = (
    info: CellContext<RawResultRow, string>,
    parameters?: ParametersValuesMap,
) => getValueCell(info, parameters, { enableJsonViewer: true });

export const useColumns = (): TableColumn[] => {
    const tableName = useExplorerSelector(selectTableName);
    const tableCalculations = useExplorerSelector(selectTableCalculations);
    const customDimensions = useExplorerSelector(selectCustomDimensions);
    const additionalMetrics = useExplorerSelector(selectAdditionalMetrics);
    const sorts = useExplorerSelector(selectSorts);
    const metricOverrides = useExplorerSelector(selectMetricOverrides);

    const {
        activeFields,
        query,
        queryResults,
        unpivotedQueryResults,
        unpivotedEnabled,
        validQueryArgs,
        projectUuid,
    } = useExplorerQuery();
    const resultsMetricQuery = query.data?.metricQuery;
    const resultsFields = query.data?.fields;

    const parameters = useExplorerSelector(selectParameters);
    const timezone = useExplorerSelector(selectTimezone);

    const { data: exploreData } = useExplore(tableName, {
        refetchOnMount: false,
    });

    const hasNoActiveFields = activeFields.size === 0;

    // Split itemsMap into base map (rarely changes) and override layer (frequently changes)
    // This prevents full recalculation when only metricOverrides change
    const baseItemsMap = useMemo<ItemsMap | undefined>(() => {
        if (!exploreData || hasNoActiveFields) return;

        const baseFields = getItemMap(
            exploreData,
            additionalMetrics,
            tableCalculations,
            customDimensions,
        );

        return {
            ...baseFields,
            ...(resultsFields || {}),
        };
    }, [
        hasNoActiveFields,
        resultsFields,
        exploreData,
        additionalMetrics,
        tableCalculations,
        customDimensions,
    ]);

    // Apply metric overrides as a separate layer
    const itemsMap = useMemo<ItemsMap | undefined>(() => {
        if (!baseItemsMap) return;

        // If no overrides, return base map directly
        if (!metricOverrides || Object.keys(metricOverrides).length === 0) {
            return baseItemsMap;
        }

        // Resolve PoP metric overrides from their base metric (shared util)
        const resolvedMetricOverrides = getMetricOverridesWithPopInheritance({
            metricOverrides,
            additionalMetrics,
        });

        // Only apply overrides to items that have them
        return Object.fromEntries(
            Object.entries(baseItemsMap).map(([key, value]) => {
                const isFromResults = resultsFields && key in resultsFields;
                if (isFromResults) {
                    return [key, value];
                }

                const override = resolvedMetricOverrides[key];
                if (!override) return [key, value];

                const itemWithoutLegacyFormat = omit(value, [
                    'format',
                    'round',
                ]);
                return [
                    key,
                    {
                        ...itemWithoutLegacyFormat,
                        ...override,
                    },
                ];
            }),
        );
    }, [baseItemsMap, metricOverrides, resultsFields, additionalMetrics]);

    const { activeItemsMap, invalidActiveItems } = useMemo<{
        activeItemsMap: ItemsMap;
        invalidActiveItems: string[];
    }>(() => {
        if (!itemsMap) {
            return { activeItemsMap: {}, invalidActiveItems: [] };
        }

        const result: {
            activeItemsMap: ItemsMap;
            invalidActiveItems: string[];
        } = {
            activeItemsMap: {},
            invalidActiveItems: [],
        };

        // Filter itemsMap to only include fields to be rendered (preserves order via Set insertion)
        for (const fieldId of activeFields) {
            const item = itemsMap[fieldId];
            if (item) {
                result.activeItemsMap[fieldId] = item;
            } else {
                result.invalidActiveItems.push(fieldId);
            }
        }

        return result;
    }, [itemsMap, activeFields]);

    const sourceQueryUuid = unpivotedEnabled
        ? unpivotedQueryResults.queryUuid
        : queryResults.queryUuid;
    const hasMetricFields = !!resultsMetricQuery?.metrics.length;
    const { data: totals } = useAsyncCalculateTotal({
        projectUuid,
        sourceQueryUuid,
        enabled: !!sourceQueryUuid && hasMetricFields,
        invalidateCache: validQueryArgs?.invalidateCache,
    });

    return useMemo(() => {
        if (hasNoActiveFields) {
            return [];
        }

        const hasJoins = (exploreData?.joinedTables || []).length > 0;

        const validColumns = Object.entries(activeItemsMap).reduce<
            TableColumn[]
        >((acc, [fieldId, item]) => {
            const sortIndex = sorts.findIndex((sf) => fieldId === sf.fieldId);
            const isFieldSorted = sortIndex !== -1;
            const fieldColors = getFieldColors(item);
            const column: TableColumn = columnHelper.accessor(
                (row) => row[fieldId],
                {
                    id: fieldId,
                    header: () => (
                        <TableHeaderLabelContainer
                            color={fieldColors.columnHeaderColor}
                        >
                            {isField(item) ? (
                                <>
                                    {hasJoins && (
                                        <TableHeaderRegularLabel>
                                            {item.tableLabel}{' '}
                                        </TableHeaderRegularLabel>
                                    )}

                                    <TableHeaderBoldLabel>
                                        {item.label}
                                    </TableHeaderBoldLabel>
                                </>
                            ) : isCustomDimension(item) ? (
                                <TableHeaderBoldLabel>
                                    {item.name}
                                </TableHeaderBoldLabel>
                            ) : (
                                <TableHeaderBoldLabel>
                                    {item && 'displayName' in item
                                        ? item.displayName
                                        : 'Undefined'}
                                </TableHeaderBoldLabel>
                            )}
                        </TableHeaderLabelContainer>
                    ),
                    cell: (
                        info: CellContext<ResultRow, { value: ResultValue }>,
                    ) => {
                        const cellValue = info.getValue();
                        const jsonValue = getResultJsonCellValue(cellValue);
                        if (jsonValue) {
                            return <JsonCellPreview value={jsonValue} />;
                        }

                        return formatResultsTableCell(
                            info.getValue(),
                            info.column.columnDef.meta?.item,
                            parameters,
                            timezone,
                        );
                    },
                    footer: () =>
                        totals?.[fieldId]
                            ? formatItemValue(
                                  item,
                                  totals[fieldId],
                                  false,
                                  parameters,
                                  timezone,
                              )
                            : null,
                    meta: {
                        item,
                        draggable: true,
                        frozen: false,
                        bgColor: fieldColors.bg,
                        sort: isFieldSorted
                            ? {
                                  sortIndex,
                                  sort: sorts[sortIndex],
                                  isMultiSort: sorts.length > 1,
                                  isNumeric: isNumericItem(item),
                              }
                            : undefined,
                    },
                },
            );

            return [...acc, column];
        }, []);

        const invalidColumns = invalidActiveItems.reduce<TableColumn[]>(
            (acc, fieldId) => {
                const column: TableColumn = columnHelper.accessor(
                    (row) => row[fieldId],
                    {
                        id: fieldId,
                        header: () => (
                            <Group spacing="two">
                                <Tooltip
                                    withinPortal
                                    label="This field was not found in the dbt project."
                                    position="top"
                                >
                                    <MantineIcon
                                        display="inline"
                                        icon={IconExclamationCircle}
                                        color="yellow"
                                    />
                                </Tooltip>

                                <TableHeaderBoldLabel
                                    style={{ marginLeft: 10 }}
                                >
                                    {fieldId}
                                </TableHeaderBoldLabel>
                            </Group>
                        ),
                        cell: getJsonFormattedValueCell,
                        meta: {
                            isInvalidItem: true,
                        },
                    },
                );
                return [...acc, column];
            },
            [],
        );

        return [...validColumns, ...invalidColumns];
    }, [
        hasNoActiveFields,
        activeItemsMap,
        invalidActiveItems,
        sorts,
        totals,
        exploreData,
        parameters,
        timezone,
    ]);
};
