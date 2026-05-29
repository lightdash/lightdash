import {
    convertFormattedValue,
    getItemLabel,
    isCustomDimension,
    isDimension,
    isField,
    isMetric,
    isNumericItem,
    isTableCalculation,
    itemsInMetricQuery,
    type ColumnProperties,
    type ConditionalFormattingConfig,
    type ConditionalFormattingMinMaxMap,
    type DashboardFilters,
    type DateZoom,
    type ItemsMap,
    type MetricQuery,
    type ParametersValuesMap,
    type PivotConfig,
    type PivotData,
    type RowLimit,
    type TableChart,
} from '@lightdash/common';
import { createWorkerFactory, useWorker } from '@shopify/react-web-worker';
import uniq from 'lodash/uniq';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useEmbed from '../../ee/providers/Embed/useEmbed';
import { useAsyncCalculateTotal } from '../useAsyncCalculateTotal';
import { useCalculateSubtotals } from '../useCalculateSubtotals';
import { useIsHidePivotDimsEnabled } from '../useIsHidePivotDimsEnabled';
import { useIsPivotRowGroupingEnabled } from '../useIsPivotRowGroupingEnabled';
import { useProjectUuid } from '../useProjectUuid';
import { type InfiniteQueryResults } from '../useQueryResults';
import getDataAndColumns from './getDataAndColumns';

const createWorker = createWorkerFactory(
    () => import('@lightdash/common/src/pivot/pivotQueryResults'),
);

const useTableConfig = (
    tableChartConfig: TableChart | undefined,
    resultsData:
        | (InfiniteQueryResults & {
              metricQuery?: MetricQuery;
              fields?: ItemsMap;
              resolvedTimezone?: string;
          })
        | undefined,
    itemsMap: ItemsMap | undefined,
    columnOrder: string[],
    pivotDimensions: string[] | undefined,
    pivotTableMaxColumnLimit: number,
    savedChartUuid?: string,
    dashboardFilters?: DashboardFilters,
    invalidateCache?: boolean,
    parameters?: ParametersValuesMap,
    dateZoom?: DateZoom,
) => {
    const { embedToken } = useEmbed();

    const [showColumnCalculation, setShowColumnCalculation] = useState<boolean>(
        !!tableChartConfig?.showColumnCalculation,
    );

    const [showRowCalculation, setShowRowCalculation] = useState<boolean>(
        !!tableChartConfig?.showRowCalculation,
    );

    const [conditionalFormattings, setConditionalFormattings] = useState<
        ConditionalFormattingConfig[]
    >(tableChartConfig?.conditionalFormattings ?? []);

    const [showTableNames, setShowTableNames] = useState<boolean>(
        tableChartConfig?.showTableNames ?? false,
    );
    const [showResultsTotal, setShowResultsTotal] = useState<boolean>(
        tableChartConfig?.showResultsTotal ?? false,
    );
    const [showSubtotals, setShowSubtotals] = useState<boolean>(
        tableChartConfig?.showSubtotals ?? false,
    );
    const [showSubtotalsExpanded, setShowSubtotalsExpanded] = useState<boolean>(
        tableChartConfig?.showSubtotalsExpanded ?? false,
    );
    // Raw, persisted value of the user toggle. We never clobber this with
    // the flag — if the user saved `showRowGrouping: true` while the
    // PivotRowGrouping flag was on and the flag later flips off, we want to
    // preserve their intent for when the flag flips back. Renders use
    // `effectiveShowRowGrouping` below which gates on the live flag value.
    const [showRowGrouping, setShowRowGrouping] = useState<boolean>(
        tableChartConfig?.showRowGrouping ?? false,
    );
    const [hideRowNumbers, setHideRowNumbers] = useState<boolean>(
        tableChartConfig?.hideRowNumbers === undefined
            ? false
            : tableChartConfig.hideRowNumbers,
    );

    const [metricsAsRows, setMetricsAsRows] = useState<boolean>(
        tableChartConfig?.metricsAsRows || false,
    );

    const [rowLimit, setRowLimit] = useState<RowLimit | undefined>(
        tableChartConfig?.rowLimit,
    );

    useEffect(() => {
        if (
            tableChartConfig?.showTableNames === undefined &&
            itemsMap !== undefined
        ) {
            const hasItemsFromMultipleTables =
                Object.values(itemsMap).reduce<string[]>((acc, item) => {
                    if (isField(item)) {
                        acc.push(item.table);
                    }
                    return uniq(acc);
                }, []).length > 0;
            if (hasItemsFromMultipleTables) {
                setShowTableNames(true);
            }
        }
    }, [itemsMap, tableChartConfig?.showTableNames]);

    const [columnProperties, setColumnProperties] = useState<
        Record<string, ColumnProperties>
    >(tableChartConfig?.columns === undefined ? {} : tableChartConfig?.columns);

    const selectedItemIds = useMemo(() => {
        return resultsData?.metricQuery
            ? itemsInMetricQuery(resultsData.metricQuery)
            : undefined;
    }, [resultsData?.metricQuery]);

    const getFieldLabelDefault = useCallback(
        (fieldId: string | null | undefined) => {
            if (!fieldId || !itemsMap || !(fieldId in itemsMap))
                return undefined;

            const item = itemsMap[fieldId];

            if (isField(item) && !showTableNames) {
                return item.label;
            } else {
                return getItemLabel(item);
            }
        },
        [itemsMap, showTableNames],
    );

    const getFieldLabelOverride = useCallback(
        (fieldId: string | null | undefined) => {
            return fieldId ? columnProperties[fieldId]?.name : undefined;
        },
        [columnProperties],
    );

    const getField = useCallback(
        (fieldId: string) => itemsMap && itemsMap[fieldId],
        [itemsMap],
    );

    const getFieldLabel = useCallback(
        (fieldId: string | null | undefined) => {
            return (
                getFieldLabelOverride(fieldId) || getFieldLabelDefault(fieldId)
            );
        },
        [getFieldLabelOverride, getFieldLabelDefault],
    );

    // PROD-2108 flag gate. When off, preserve the legacy short-circuit that
    // forced dimensions to always render while pivoting — it guarded against
    // an older pivot reducer bug where filtering an index dim corrupted
    // metric values. The PR 2 indexDimensionsForGrouping/ForDisplay split
    // fixes that root cause, but we only honor the persisted dim visibility
    // when the flag is on, so existing charts that have an unintentional
    // `columnProperties[dim].visible: false` (set by clicks during the era of
    // the buggy guard) keep rendering the dim. Flag-on opts into the new
    // behavior.
    const isHidePivotDimsEnabled = useIsHidePivotDimsEnabled();
    const isPivotRowGroupingEnabled = useIsPivotRowGroupingEnabled();

    const isColumnVisible = useCallback(
        (fieldId: string) => {
            if (
                !isHidePivotDimsEnabled &&
                pivotDimensions &&
                pivotDimensions.length > 0 &&
                isDimension(getField(fieldId))
            ) {
                return true;
            }
            return columnProperties[fieldId]?.visible ?? true;
        },
        [columnProperties, isHidePivotDimsEnabled, pivotDimensions, getField],
    );
    const isColumnFrozen = useCallback(
        (fieldId: string) => columnProperties[fieldId]?.frozen === true,
        [columnProperties],
    );

    const getColumnWidth = useCallback(
        (fieldId: string) => columnProperties[fieldId]?.width,
        [columnProperties],
    );

    const isPivotTableEnabled =
        resultsData?.metricQuery &&
        resultsData.metricQuery.metrics.length > 0 &&
        resultsData.rows.length &&
        pivotDimensions &&
        pivotDimensions.length > 0;

    const dimensions = useMemo(() => {
        if (!itemsMap) return [];

        return columnOrder.filter((fieldId) => {
            const item = itemsMap[fieldId];
            return item && (isDimension(item) || isCustomDimension(item));
        });
    }, [columnOrder, itemsMap]);

    const numUnpivotedDimensions =
        dimensions.length - (pivotDimensions?.length || 0);

    const canUseSubtotals = useMemo(() => {
        return !metricsAsRows && numUnpivotedDimensions > 1;
    }, [metricsAsRows, numUnpivotedDimensions]);

    // Once dimensions are loaded, if there are not enough dimensions to use subtotals then
    // turn off "Show subtotals" so that "Show metrics as rows" can be enabled.
    useEffect(() => {
        if (dimensions.length > 0 && numUnpivotedDimensions < 2)
            setShowSubtotals(false);
    }, [dimensions.length, numUnpivotedDimensions]);

    // Pivoted source: per-(metric × pivotValue) keys → pivot overlay.
    // Non-pivoted: flat metricId → number → Results-table totals.
    const projectUuid = useProjectUuid();
    const hasSqlPivotResults = !!resultsData?.pivotDetails;
    const canFetchAsyncTotals =
        !!resultsData?.queryUuid && !!tableChartConfig?.showColumnCalculation;
    const { data: asyncTotals } = useAsyncCalculateTotal({
        projectUuid,
        sourceQueryUuid: resultsData?.queryUuid,
        enabled: canFetchAsyncTotals,
        invalidateCache,
    });

    const { data: groupedSubtotals } = useCalculateSubtotals(
        embedToken && savedChartUuid
            ? {
                  savedChartUuid,
                  dashboardFilters,
                  invalidateCache,
                  showSubtotals,
                  columnOrder,
                  pivotDimensions,
                  embedToken,
                  dateZoom,
              }
            : {
                  metricQuery: resultsData?.metricQuery,
                  explore: resultsData?.metricQuery?.exploreName,
                  showSubtotals,
                  columnOrder,
                  pivotDimensions,
                  embedToken,
                  parameters,
                  dateZoom,
                  invalidateCache,
              },
    );

    const columns = useMemo(() => {
        if (!selectedItemIds || !itemsMap) {
            return [];
        }

        if (pivotDimensions && pivotDimensions.length > 0) {
            return [];
        }

        return getDataAndColumns({
            itemsMap,
            selectedItemIds,
            isColumnVisible,
            showTableNames,
            getFieldLabelOverride,
            isColumnFrozen,
            getColumnWidth,
            columnOrder,
            totals: asyncTotals,
            groupedSubtotals,
            parameters,
        });
    }, [
        columnOrder,
        selectedItemIds,
        pivotDimensions,
        itemsMap,
        isColumnVisible,
        showTableNames,
        isColumnFrozen,
        getColumnWidth,
        getFieldLabelOverride,
        asyncTotals,
        groupedSubtotals,
        parameters,
    ]);
    const worker = useWorker(createWorker);
    const [pivotTableData, setPivotTableData] = useState<{
        loading: boolean;
        data: PivotData | undefined;
        error: undefined | string;
    }>({
        loading: false,
        data: undefined,
        error: undefined,
    });

    useEffect(() => {
        if (
            !pivotDimensions ||
            pivotDimensions.length === 0 ||
            !resultsData?.metricQuery ||
            resultsData.rows.length === 0
        ) {
            setPivotTableData((prevState) => {
                // Only update if values are different
                if (
                    prevState.loading !== false ||
                    prevState.data !== undefined ||
                    prevState.error !== undefined
                ) {
                    return {
                        loading: false,
                        data: undefined,
                        error: undefined,
                    };
                }
                // Return previous state if no changes needed
                return prevState;
            });

            return;
        }

        setPivotTableData((prevState) => ({
            ...prevState,
            loading: true,
            error: undefined,
        }));

        const hiddenMetricFieldIds = selectedItemIds?.filter((fieldId) => {
            const field = getField(fieldId);

            return (
                !isColumnVisible(fieldId) &&
                field &&
                ((isField(field) && isMetric(field)) ||
                    isTableCalculation(field))
            );
        });

        // Only populate the dim-side hidden list when the flag is on. Without
        // it, isColumnVisible still applies the legacy short-circuit for dims
        // and we keep the pre-PROD-2108 contract (no dim filtering downstream).
        const hiddenDimensionFieldIds = isHidePivotDimsEnabled
            ? selectedItemIds?.filter((fieldId) => {
                  const field = getField(fieldId);
                  if (!field || isColumnVisible(fieldId)) return false;
                  // Custom SQL dimensions are not `Field`s but still behave
                  // as dims in the pivot (driving sort order via
                  // sortOnlyDimensions).
                  return (
                      (isField(field) && isDimension(field)) ||
                      isCustomDimension(field)
                  );
              })
            : undefined;

        const pivotConfig: PivotConfig = {
            pivotDimensions,
            metricsAsRows,
            columnOrder,
            hiddenMetricFieldIds,
            hiddenDimensionFieldIds,
            columnTotals: tableChartConfig?.showColumnCalculation,
            rowTotals: tableChartConfig?.showRowCalculation,
        };

        if (resultsData.pivotDetails) {
            worker
                .convertSqlPivotedRowsToPivotData({
                    rows: resultsData.rows,
                    pivotDetails: resultsData.pivotDetails,
                    pivotConfig,
                    getField,
                    getFieldLabel,
                    groupedSubtotals,
                    parameters,
                })
                .then((data) => {
                    setPivotTableData({
                        loading: false,
                        data: data,
                        error: undefined,
                    });
                })
                .catch((e) => {
                    setPivotTableData({
                        loading: false,
                        data: undefined,
                        error: e.message,
                    });
                });
        } else {
            worker
                .pivotQueryResults({
                    pivotConfig,
                    metricQuery: resultsData.metricQuery,
                    rows: resultsData.rows,
                    groupedSubtotals,
                    options: {
                        maxColumns: pivotTableMaxColumnLimit,
                    },
                    getField,
                    getFieldLabel,
                    parameters,
                })
                .then((data) => {
                    setPivotTableData({
                        loading: false,
                        data: data,
                        error: undefined,
                    });
                })
                .catch((e) => {
                    setPivotTableData({
                        loading: false,
                        data: undefined,
                        error: e.message,
                    });
                });
        }
    }, [
        resultsData,
        pivotDimensions,
        columnOrder,
        metricsAsRows,
        selectedItemIds,
        isColumnVisible,
        isHidePivotDimsEnabled,
        getField,
        getFieldLabel,
        tableChartConfig?.showColumnCalculation,
        tableChartConfig?.showRowCalculation,
        worker,
        pivotTableMaxColumnLimit,
        groupedSubtotals,
        parameters,
    ]);

    // Remove columnProperties from map if the column has been removed from results
    useEffect(() => {
        if (Object.keys(columnProperties).length > 0 && selectedItemIds) {
            const newColumnProperties = Object.keys(columnProperties).reduce<
                Record<string, ColumnProperties>
            >(
                (acc, field) =>
                    selectedItemIds.includes(field)
                        ? {
                              ...acc,
                              [field]: columnProperties[field],
                          }
                        : acc,
                {},
            );
            // only update if something changed, otherwise we get into an infinite loop
            if (
                Object.keys(columnProperties).length !==
                Object.keys(newColumnProperties).length
            ) {
                setColumnProperties(newColumnProperties);
            }
        }
    }, [selectedItemIds, columnProperties]);

    const updateColumnProperty = useCallback(
        (field: string, properties: Partial<ColumnProperties>) => {
            // functional setter so consecutive calls compose correctly

            setColumnProperties((prev) => ({
                ...prev,
                [field]:
                    field in prev
                        ? { ...prev[field], ...properties }
                        : { ...properties },
            }));
        },
        [],
    );

    const handleSetConditionalFormattings = useCallback(
        (configs: ConditionalFormattingConfig[]) => {
            setConditionalFormattings(configs);
        },
        [],
    );

    const prevMinMaxQueryUuidRef = useRef<string | undefined>(undefined);
    const prevMinMaxFieldsRef = useRef<string>('');
    const cachedMinMaxMapRef = useRef<
        ConditionalFormattingMinMaxMap | undefined
    >(undefined);

    const minMaxMap = useMemo(() => {
        if (!itemsMap || !resultsData || resultsData.rows.length === 0) {
            return undefined;
        }

        // Step 1: Identify which fields need min/max calculation
        const fieldsNeedingMinMax = new Set<string>();

        conditionalFormattings?.forEach((config) => {
            if (config.target) {
                fieldsNeedingMinMax.add(config.target.fieldId);
            }
        });

        Object.entries(columnProperties).forEach(([fieldId, props]) => {
            if (props.displayStyle === 'bar') {
                fieldsNeedingMinMax.add(fieldId);
            }
        });

        if (fieldsNeedingMinMax.size === 0) {
            prevMinMaxQueryUuidRef.current = resultsData.queryUuid;
            prevMinMaxFieldsRef.current = '';
            cachedMinMaxMapRef.current = undefined;
            return undefined;
        }

        // Step 2: Check cache - avoid recalculation if query and fields haven't changed
        const currentQueryUuid = resultsData.queryUuid;
        const currentFieldsKey = Array.from(fieldsNeedingMinMax)
            .sort()
            .join(',');

        if (
            currentQueryUuid &&
            currentQueryUuid === prevMinMaxQueryUuidRef.current &&
            currentFieldsKey === prevMinMaxFieldsRef.current &&
            cachedMinMaxMapRef.current !== undefined
        ) {
            return cachedMinMaxMapRef.current;
        }

        // Step 3: Build field-to-columns mapping
        // For SQL pivots: Maps base field (e.g., "revenue") to pivot columns (e.g., ["revenue_bank", "revenue_paypal"])
        // For non-pivots: Direct 1:1 mapping (e.g., "revenue" → ["revenue"])
        const fieldColumnMapping = new Map<string, string[]>();

        for (const fieldId of fieldsNeedingMinMax) {
            if (!isColumnVisible(fieldId)) continue;

            const field = itemsMap[fieldId];
            if (!field || !isNumericItem(field)) continue;

            if (!resultsData.pivotDetails) {
                fieldColumnMapping.set(fieldId, [fieldId]);
            } else {
                const pivotColumnNames = resultsData.pivotDetails.valuesColumns
                    .filter((col) => col.referenceField === fieldId)
                    .map((col) => col.pivotColumnName);
                if (pivotColumnNames.length > 0) {
                    fieldColumnMapping.set(fieldId, pivotColumnNames);
                }
            }
        }

        if (fieldColumnMapping.size === 0) {
            prevMinMaxQueryUuidRef.current = currentQueryUuid;
            prevMinMaxFieldsRef.current = currentFieldsKey;
            cachedMinMaxMapRef.current = undefined;
            return undefined;
        }

        // Step 4: Single-pass collection of all values
        const fieldValues = new Map<string, number[]>();
        for (const fieldId of fieldColumnMapping.keys()) {
            fieldValues.set(fieldId, []);
        }

        for (const row of resultsData.rows) {
            for (const [fieldId, columnNames] of fieldColumnMapping.entries()) {
                const values = fieldValues.get(fieldId) ?? [];
                const field = itemsMap[fieldId];

                for (const columnName of columnNames) {
                    const rawValue = row[columnName]?.value?.raw;
                    if (
                        rawValue !== undefined &&
                        rawValue !== null &&
                        rawValue !== ''
                    ) {
                        const numValue = Number(rawValue);
                        if (!Number.isNaN(numValue)) {
                            values.push(convertFormattedValue(numValue, field));
                        }
                    }
                }

                // Update the values for the field
                fieldValues.set(fieldId, values);
            }
        }

        // Step 5: Calculate min/max for each field
        const result: ConditionalFormattingMinMaxMap = {};
        for (const [fieldId, values] of fieldValues.entries()) {
            if (values.length > 0) {
                result[fieldId] = {
                    min: Math.min(...values),
                    max: Math.max(...values),
                };
            }
        }

        const finalResult = Object.keys(result).length > 0 ? result : undefined;

        // Step 6: Update cache
        prevMinMaxQueryUuidRef.current = currentQueryUuid;
        prevMinMaxFieldsRef.current = currentFieldsKey;
        cachedMinMaxMapRef.current = finalResult;

        return finalResult;
    }, [
        conditionalFormattings,
        columnProperties,
        isColumnVisible,
        itemsMap,
        resultsData,
    ]);

    const exposedColumnProperties = columnProperties;

    // Overlay warehouse-computed totals onto the worker's client-side ones.
    // We match cells by (metric, pivotValue) since the warehouse keys
    // (`<metric>_any_<value>`) differ from the worker's synthetic column ids.
    const effectivePivotTableData = useMemo(() => {
        if (!pivotTableData.data || !pivotTableData.data.columnTotals) {
            return pivotTableData;
        }
        // Only the SQL-pivot path produces keys our overlay can match
        // (`<metric>_any_<value>`). In-memory pivots have flat keys, so the
        // lookups would all miss but the new data ref would still trip
        // `columnTotalsAreWarehouseComputed`.
        if (!hasSqlPivotResults || !asyncTotals) {
            return pivotTableData;
        }
        const { headerValues } = pivotTableData.data;
        const metricRow = headerValues[headerValues.length - 1] ?? [];
        // metricsAsRows=true has a different headerValues shape — skip
        // overlay there for now and let the worker's totals stand.
        const pivotDimRows = headerValues.slice(0, -1);
        if (pivotDimRows.length === 0) {
            return pivotTableData;
        }

        const extractNumeric = (raw: unknown): number | undefined => {
            const candidate =
                typeof raw === 'object' && raw !== null && 'value' in raw
                    ? (raw as { value?: { raw?: unknown } }).value?.raw
                    : raw;
            const n = Number(candidate);
            return Number.isFinite(n) ? n : undefined;
        };

        const nextColumnTotals = pivotTableData.data.columnTotals.map((row) =>
            row.map((existingValue, colIndex) => {
                const metricCell = metricRow[colIndex];
                if (!metricCell || !metricCell.fieldId) {
                    return existingValue;
                }
                const pivotValues = pivotDimRows.map((dimRow) => {
                    const cell = dimRow[colIndex];
                    if (
                        cell &&
                        cell.type === 'value' &&
                        cell.value?.raw !== undefined &&
                        cell.value?.raw !== null
                    ) {
                        return String(cell.value.raw);
                    }
                    return undefined;
                });
                if (pivotValues.some((v) => v === undefined)) {
                    return existingValue;
                }
                // Backend PivotQueryBuilder emits column names of the form
                // `<metric>_<agg>_<pivotValue1>_<pivotValue2>...`. Metric
                // aggregations default to 'any' when the source field is
                // already aggregated (i.e. a Lightdash metric).
                const key = [
                    metricCell.fieldId,
                    'any',
                    ...(pivotValues as string[]),
                ].join('_');
                const rawTotal = asyncTotals[key];
                if (rawTotal === undefined || rawTotal === null) {
                    return existingValue;
                }
                const numeric = extractNumeric(rawTotal);
                return numeric === undefined ? existingValue : numeric;
            }),
        );
        return {
            ...pivotTableData,
            data: {
                ...pivotTableData.data,
                columnTotals: nextColumnTotals,
            },
        };
    }, [pivotTableData, asyncTotals, hasSqlPivotResults]);

    // True when the overlay above replaced `columnTotals` — callers
    // forward this so PivotTable skips the `isSummable` footer gate.
    const columnTotalsAreWarehouseComputed =
        effectivePivotTableData.data !== pivotTableData.data;

    const validConfig: TableChart = useMemo(
        () => ({
            showColumnCalculation,
            showRowCalculation,
            showTableNames,
            showResultsTotal,
            showSubtotals,
            showSubtotalsExpanded,
            showRowGrouping,
            columns: columnProperties,
            hideRowNumbers,
            conditionalFormattings,
            metricsAsRows,
            rowLimit,
        }),
        [
            showColumnCalculation,
            showRowCalculation,
            hideRowNumbers,
            showTableNames,
            showResultsTotal,
            showSubtotals,
            showSubtotalsExpanded,
            showRowGrouping,
            columnProperties,
            conditionalFormattings,
            metricsAsRows,
            rowLimit,
        ],
    );

    return useMemo(
        () => ({
            selectedItemIds,
            columnOrder,
            validConfig,
            showColumnCalculation,
            setShowColumnCalculation,
            showRowCalculation,
            setShowRowCalculation,
            showTableNames,
            setShowTableNames,
            hideRowNumbers,
            setHideRowNumbers,
            showResultsTotal,
            setShowResultsTotal,
            showSubtotals,
            setShowSubtotals,
            showSubtotalsExpanded,
            setShowSubtotalsExpanded,
            // Effective render value: flag gate ensures flag-off viewers
            // of a flag-on-saved chart see legacy rendering. Raw value
            // lives in `validConfig.showRowGrouping` for persistence.
            showRowGrouping: isPivotRowGroupingEnabled && showRowGrouping,
            setShowRowGrouping,

            columnProperties: exposedColumnProperties,
            setColumnProperties,
            updateColumnProperty,
            columns,
            getFieldLabelOverride,
            getFieldLabelDefault,
            getFieldLabel,
            getField,
            isColumnVisible,
            isColumnFrozen,
            minMaxMap,
            conditionalFormattings,
            onSetConditionalFormattings: handleSetConditionalFormattings,
            pivotTableData: effectivePivotTableData,
            columnTotalsAreWarehouseComputed,
            metricsAsRows,
            setMetricsAsRows,
            isPivotTableEnabled,
            canUseSubtotals,
            groupedSubtotals,
            rowLimit,
            setRowLimit,
        }),
        [
            selectedItemIds,
            columnOrder,
            validConfig,
            showColumnCalculation,
            setShowColumnCalculation,
            showRowCalculation,
            setShowRowCalculation,
            showTableNames,
            setShowTableNames,
            hideRowNumbers,
            setHideRowNumbers,
            showResultsTotal,
            setShowResultsTotal,
            showSubtotals,
            setShowSubtotals,
            showSubtotalsExpanded,
            setShowSubtotalsExpanded,
            showRowGrouping,
            setShowRowGrouping,
            isPivotRowGroupingEnabled,

            exposedColumnProperties,
            setColumnProperties,
            updateColumnProperty,
            columns,
            getFieldLabelOverride,
            getFieldLabelDefault,
            getFieldLabel,
            getField,
            isColumnVisible,
            isColumnFrozen,
            minMaxMap,
            conditionalFormattings,
            handleSetConditionalFormattings,
            effectivePivotTableData,
            columnTotalsAreWarehouseComputed,
            metricsAsRows,
            setMetricsAsRows,
            isPivotTableEnabled,
            canUseSubtotals,
            groupedSubtotals,
            rowLimit,
            setRowLimit,
        ],
    );
};

export default useTableConfig;
