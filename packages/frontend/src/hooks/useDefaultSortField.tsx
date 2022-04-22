import {
    DimensionType,
    fieldId as getFieldId,
    getDimensions,
    getMetrics,
    SortField,
} from 'common';
import { useMemo } from 'react';
import { useExplorer } from '../providers/ExplorerProvider';
import { useExplore } from './useExplore';

const useDefaultSortField = (): SortField | undefined => {
    const {
        state: {
            savedChartVersion: {
                tableName,
                metricQuery: { dimensions, metrics },
                tableConfig: { columnOrder },
            },
        },
    } = useExplorer();
    const { data } = useExplore(tableName);

    return useMemo(() => {
        if (data) {
            console.log('aqui', data);
            const dimensionFields = getDimensions(data).filter((field) =>
                dimensions.includes(getFieldId(field)),
            );
            console.log('depois', dimensionFields);
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
            const firstMetricField = getMetrics(data).find(
                (field) => firstMetric === getFieldId(field),
            );
            if (firstMetricField) {
                return {
                    fieldId: getFieldId(firstMetricField),
                    descending: true,
                };
            }
            const firstDimension = columnOrder.find((c) =>
                dimensions.includes(c),
            );
            const firstDimensionField = dimensionFields.find(
                (field) => firstDimension === getFieldId(field),
            );

            if (firstDimensionField) {
                return {
                    fieldId: getFieldId(firstDimensionField),
                    descending: false,
                };
            }
        }
        return undefined;
    }, [columnOrder, data, dimensions, metrics]);
};

export default useDefaultSortField;
