import {
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
import { useEffect, useMemo, useState } from 'react';

type FunnelChartConfig = {
    validConfig: FunnelChart;

    fieldId: string | null;
    selectedField: Metric | TableCalculation | undefined;
    fieldChange: (fieldId: string | null) => void;

    data: {
        name: string;
        value: number;
    }[];
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

    const data = useMemo(() => {
        if (
            !resultsData ||
            !fieldId ||
            !selectedField ||
            resultsData.rows.length === 0
        ) {
            return [];
        }
        console.log({ resultsData });

        const fieldIndex = Object.keys(resultsData.rows[0]).findIndex(
            (field) => {
                return field === fieldId;
            },
        );

        return resultsData.rows.map<{ name: string; value: number }>((row) => {
            const rowValues = Object.values(row).map((col) => col.value);
            return {
                name: rowValues[0].formatted,
                value: Number(rowValues[fieldIndex].raw),
            };
        });
    }, [fieldId, resultsData, selectedField]);

    const validConfig: FunnelChart = useMemo(
        () => ({
            fieldId: fieldId ?? undefined,
        }),
        [fieldId],
    );

    return {
        validConfig,
        selectedField,
        fieldId,
        fieldChange: setFieldId,
        colorPalette,
        data,
    };
};

export default useFunnelChartConfig;
