import {
    formatItemValue,
    getItemId,
    hashFieldReference,
    isDimension,
    ItemsMap,
    ResultValue,
} from '@lightdash/common';
import { EChartSeries } from '../../../hooks/echarts/useEchartsCartesianConfig';
import { EchartSeriesClickEvent } from '../../SimpleChart';
import { UnderlyingDataConfig } from '../MetricQueryDataProvider';

export const getDataFromChartClick = (
    e: EchartSeriesClickEvent,
    itemsMap: ItemsMap,
    series: EChartSeries[],
): UnderlyingDataConfig => {
    const pivotReference = series[e.seriesIndex]?.pivotReference;
    const selectedFields = Object.values(itemsMap).filter((item) => {
        if (
            !isDimension(item) &&
            pivotReference &&
            pivotReference.field === getItemId(item)
        ) {
            return e.dimensionNames.includes(
                hashFieldReference(pivotReference),
            );
        }
        return e.dimensionNames.includes(getItemId(item));
    });
    const selectedMetricsAndTableCalculations = selectedFields.filter(
        (item) => !isDimension(item),
    );

    let selectedField: ItemsMap[string] | undefined = undefined;
    if (selectedMetricsAndTableCalculations.length > 0) {
        selectedField = selectedMetricsAndTableCalculations[0];
    } else if (selectedFields.length > 0) {
        selectedField = selectedFields[0];
    }
    const selectedValue = selectedField
        ? e.data[getItemId(selectedField)]
        : undefined;
    const fieldValues: Record<string, ResultValue> = Object.entries(
        e.data,
    ).reduce((acc, entry) => {
        const [key, val] = entry;
        return { ...acc, [key]: { raw: val, formatted: val } };
    }, {});

    return {
        item: selectedField,
        value: {
            raw: selectedValue,
            formatted: formatItemValue(selectedField, selectedValue),
        },
        fieldValues,
        pivotReference,
    };
};
