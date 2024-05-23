import {
    DimensionType,
    getDimensions,
    getItemId,
    getMetrics,
    type CreateSavedChartVersion,
    type SortField,
} from '@lightdash/common';
import { useMemo } from 'react';
import { useExplore } from './useExplore';

const useDefaultSortField = (
    savedChart: CreateSavedChartVersion,
): SortField | undefined => {
    const {
        tableName,
        metricQuery: { dimensions, metrics },
        tableConfig: { columnOrder },
    } = savedChart;
    const { data } = useExplore(tableName);

    return useMemo(() => {
        if (data) {
            const dimensionFields = getDimensions(data).filter((field) =>
                dimensions.includes(getItemId(field)),
            );

            const timeDimension = dimensionFields.find(({ type }) =>
                [DimensionType.DATE, DimensionType.TIMESTAMP].includes(type),
            );

            if (timeDimension) {
                return {
                    fieldId: getItemId(timeDimension),
                    descending: true,
                };
            }

            const firstMetric = columnOrder.find((c) => metrics.includes(c));
            const firstMetricField = getMetrics(data).find(
                (field) => firstMetric === getItemId(field),
            );
            if (firstMetricField) {
                return {
                    fieldId: getItemId(firstMetricField),
                    descending: true,
                };
            }
            const firstDimension = columnOrder.find((c) =>
                dimensions.includes(c),
            );
            const firstDimensionField = dimensionFields.find(
                (field) => firstDimension === getItemId(field),
            );

            if (firstDimensionField) {
                return {
                    fieldId: getItemId(firstDimensionField),
                    descending: false,
                };
            }
        }
        return undefined;
    }, [columnOrder, data, dimensions, metrics]);
};

export default useDefaultSortField;
