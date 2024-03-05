import {
    CreateSavedChartVersion,
    DimensionType,
    Explore,
    fieldId as getFieldId,
    getDimensions,
    getMetrics,
    SortField,
} from '@lightdash/common';
import { useMemo } from 'react';

const useDefaultSortField = (
    explore: Explore | undefined,
    savedChart: CreateSavedChartVersion,
): SortField | undefined => {
    const {
        metricQuery: { dimensions, metrics },
        tableConfig: { columnOrder },
    } = savedChart;

    return useMemo(() => {
        if (!explore) return undefined;

        const dimensionFields = getDimensions(explore).filter((field) =>
            dimensions.includes(getFieldId(field)),
        );

        const timeDimension = dimensionFields.find(({ type }) =>
            [DimensionType.DATE, DimensionType.TIMESTAMP].includes(type),
        );

        if (timeDimension) {
            return {
                fieldId: getFieldId(timeDimension),
                descending: true,
            };
        }

        const firstMetric = columnOrder.find((c) => metrics.includes(c));
        const firstMetricField = getMetrics(explore).find(
            (field) => firstMetric === getFieldId(field),
        );
        if (firstMetricField) {
            return {
                fieldId: getFieldId(firstMetricField),
                descending: true,
            };
        }
        const firstDimension = columnOrder.find((c) => dimensions.includes(c));
        const firstDimensionField = dimensionFields.find(
            (field) => firstDimension === getFieldId(field),
        );

        if (firstDimensionField) {
            return {
                fieldId: getFieldId(firstDimensionField),
                descending: false,
            };
        }
    }, [columnOrder, explore, dimensions, metrics]);
};

export default useDefaultSortField;
