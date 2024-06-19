import {
    FunnelChartDataInput,
    isField,
    isMetric,
    isTableCalculation,
    type ApiQueryResults,
    type CustomDimension,
    type Dimension,
    type FunnelChart,
    type ItemsMap,
    type Metric,
    type TableCalculation,
    type TableCalculationMetadata,
} from '@lightdash/common';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type FunnelSeriesDataPoint } from './echarts/useEchartsFunnelConfig';

type FunnelChartConfig = {
    validConfig: FunnelChart;

    fieldId: string | null;
    maxValue: number;
    selectedField: Metric | TableCalculation | undefined;
    fieldChange: (fieldId: string | null) => void;

    dataInput: FunnelChartDataInput;
    setDataInput: (dataInput: FunnelChartDataInput) => void;

    data: FunnelSeriesDataPoint[];
};

export type FunnelChartConfigFn = (
    resultsData: ApiQueryResults | undefined,
    funnelChartConfig: FunnelChart | undefined,
    itemsMap: ItemsMap | undefined,
    dimensions: Record<string, CustomDimension | Dimension>,
    numericFields: Record<string, Metric | TableCalculation>,
    colorPalette: string[],
    tableCalculationsMetadata?: TableCalculationMetadata[],
) => FunnelChartConfig;

const useFunnelChartConfig: FunnelChartConfigFn = (
    resultsData,
    funnelChartConfig,
    itemsMap,
    dimensions,
    numericFields,
    colorPalette,
    tableCalculationsMetadata,
) => {
    const [fieldId, setFieldId] = useState(funnelChartConfig?.fieldId ?? null);

    const [dataInput, setDataInput] = useState(
        funnelChartConfig?.dataInput ?? FunnelChartDataInput.ROW,
    );

    // The value at the top of the funnel.
    const maxValue = useRef(0);

    const allNumericFieldIds = useMemo(
        () => Object.keys(numericFields),
        [numericFields],
    );

    const selectedField = useMemo(() => {
        if (!itemsMap || !fieldId) return undefined;
        const item = itemsMap[fieldId];

        if ((isField(item) && isMetric(item)) || isTableCalculation(item))
            return item;

        return undefined;
    }, [itemsMap, fieldId]);

    const isLoading = !resultsData;

    useEffect(() => {
        if (isLoading || allNumericFieldIds.length === 0) return;
        if (fieldId && allNumericFieldIds.includes(fieldId)) return;

        /**
         * When table calculations update, their name changes, so we need to update the selected fields
         * If the selected field is a table calculation with the old name in the metadata, set it to the new name
         */
        if (tableCalculationsMetadata) {
            const metricTcIndex = tableCalculationsMetadata.findIndex(
                (tc) => tc.oldName === fieldId,
            );

            if (metricTcIndex !== -1) {
                setFieldId(tableCalculationsMetadata[metricTcIndex].name);
                return;
            }
        }

        setFieldId(allNumericFieldIds[0] ?? null);
    }, [allNumericFieldIds, fieldId, isLoading, tableCalculationsMetadata]);

    const data: FunnelSeriesDataPoint[] = useMemo(() => {
        if (
            !resultsData ||
            !fieldId ||
            !selectedField ||
            resultsData.rows.length === 0
        ) {
            return [];
        }

        if (dataInput === FunnelChartDataInput.COLUMN) {
            const fieldIndex = Object.keys(resultsData.rows[0]).findIndex(
                (field) => {
                    return field === fieldId;
                },
            );

            if (fieldIndex === -1) {
                return [];
            }

            return resultsData.rows.map<FunnelSeriesDataPoint>((row) => {
                const rowValues = Object.values(row).map((col) => col.value);

                const dataValue = Number(rowValues[fieldIndex].raw);
                if (dataValue > maxValue.current) {
                    maxValue.current = dataValue;
                }
                return {
                    name: rowValues[0].formatted,
                    value: dataValue,
                    meta: {
                        value: rowValues[fieldIndex],
                        rows: [row],
                    },
                };
            });
        } else {
            return allNumericFieldIds.reduce((acc, id) => {
                if (resultsData.rows[0][id]) {
                    const dataValue = Number(resultsData.rows[0][id].value.raw);
                    if (dataValue > maxValue.current) {
                        maxValue.current = dataValue;
                    }
                    acc.push({
                        name: id,
                        value: dataValue,
                        meta: {
                            value: resultsData.rows[0][id].value,
                            rows: resultsData.rows,
                        },
                    });
                }
                return acc;
            }, [] as Array<FunnelSeriesDataPoint>);
        }
    }, [allNumericFieldIds, dataInput, fieldId, resultsData, selectedField]);

    const validConfig: FunnelChart = useMemo(
        () => ({
            dataInput: dataInput,
            fieldId: fieldId ?? undefined,
        }),
        [dataInput, fieldId],
    );

    return {
        validConfig,
        selectedField,
        fieldId,
        maxValue: maxValue.current,
        fieldChange: setFieldId,
        dataInput,
        setDataInput,
        colorPalette,
        data,
    };
};

export default useFunnelChartConfig;
