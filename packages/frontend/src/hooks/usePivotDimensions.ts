import { type MetricQuery } from '@lightdash/common';
import { useCallback, useMemo, type SetStateAction } from 'react';

const usePivotDimensions = (
    pivotDimensions: string[] | undefined,
    metricQuery: MetricQuery | undefined,
    onPivotDimensionsChange?: (value: string[] | undefined) => void,
) => {
    const validPivotDimensions = useMemo(() => {
        if (metricQuery) {
            const availableDimensions = metricQuery.dimensions;

            if (
                pivotDimensions &&
                pivotDimensions.some((key) => availableDimensions.includes(key))
            ) {
                return pivotDimensions.filter((key) =>
                    availableDimensions.includes(key),
                );
            }
            return undefined;
        }
    }, [metricQuery, pivotDimensions]);

    const setPivotDimensions = useCallback(
        (value: SetStateAction<string[] | undefined>) => {
            // Handle both direct values and updater functions
            const nextValue =
                typeof value === 'function' ? value(pivotDimensions) : value;
            onPivotDimensionsChange?.(nextValue);
        },
        [onPivotDimensionsChange, pivotDimensions],
    );

    return {
        validPivotDimensions,
        setPivotDimensions,
    };
};

export default usePivotDimensions;
