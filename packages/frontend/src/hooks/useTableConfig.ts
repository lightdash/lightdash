import {
    AdditionalMetric,
    ApiQueryResults,
    ColumnProperties,
    Explore,
    Field,
    friendlyName,
    getAdditionalMetricLabel,
    getItemLabel,
    getItemMap,
    isAdditionalMetric,
    isField,
    TableCalculation,
    TableChart,
} from '@lightdash/common';
import { useMemo, useState } from 'react';

const useTableConfig = (
    tableChartConfig: TableChart | undefined,
    resultsData: ApiQueryResults | undefined,
    explore: Explore | undefined,
    columnOrder: string[],
) => {
    const [showTableNames, setShowTableName] = useState<boolean>(
        tableChartConfig?.showTableNames === undefined
            ? true
            : tableChartConfig.showTableNames,
    );

    const [columnProperties, setColumnProperties] = useState<
        ColumnProperties[]
    >(tableChartConfig?.columns === undefined ? [] : tableChartConfig?.columns);

    const itemMap = useMemo<
        Record<string, Field | AdditionalMetric | TableCalculation>
    >(() => {
        if (explore && resultsData) {
            return getItemMap(
                explore,
                resultsData.metricQuery.additionalMetrics,
                resultsData.metricQuery.tableCalculations,
            );
        }
        return {};
    }, [explore, resultsData]);

    const columnHeader = (fieldId: string) => {
        const field = itemMap && itemMap[fieldId];
        if (isAdditionalMetric(field)) {
            // AdditionalMetric
            return getAdditionalMetricLabel(field);
        } else if (isField(field)) {
            // Field
            return showTableNames ? getItemLabel(field) : field.label;
        } else {
            //TableCalculation
            return friendlyName(fieldId);
        }
    };

    const filterVisible = (fieldId: string) =>
        columnProperties.find((column) => column.field === fieldId)?.visible !==
        false;

    const headers = columnOrder.filter(filterVisible).map(columnHeader);

    const updateColumnProperty = (
        field: string,
        properties: Partial<ColumnProperties>,
    ) => {
        const existingProperties = columnProperties.find(
            (column) => column.field === field,
        );
        setColumnProperties([
            ...columnProperties.filter((column) => column.field !== field),
            {
                field: field,
                ...existingProperties,
                ...properties,
            },
        ]);
    };

    const validTableConfig: TableChart = useMemo(
        () => ({
            showTableNames,
            columns: columnProperties,
        }),
        [showTableNames, columnProperties],
    );

    return {
        columnOrder,
        validTableConfig,
        showTableNames,
        setShowTableName,
        itemMap,
        headers,
        columnProperties,
        setColumnProperties,
        updateColumnProperty,
        columnHeader,
        filterVisible,
    };
};

export default useTableConfig;
