import { type MetricQuery } from '@lightdash/common';
import { useMemo, useState } from 'react';
import { type InfiniteQueryResults } from './useQueryResults';

const usePivotDimensions = (
    initialPivotDimensions: string[] | undefined,
    resultsData:
        | (InfiniteQueryResults & { metricQuery?: MetricQuery })
        | undefined,
) => {
    const [dirtyPivotDimensions, setPivotDimensions] = useState(
        initialPivotDimensions,
    );

    const validPivotDimensions = useMemo(() => {
        if (resultsData?.metricQuery) {
            const availableDimensions = resultsData.metricQuery.dimensions;

            if (
                dirtyPivotDimensions &&
                dirtyPivotDimensions.some((key) =>
                    availableDimensions.includes(key),
                )
            ) {
                return dirtyPivotDimensions.filter((key) =>
                    availableDimensions.includes(key),
                );
            }
            return undefined;
        }
    }, [resultsData, dirtyPivotDimensions]);

    return {
        validPivotDimensions,
        setPivotDimensions,
    };
};

export default usePivotDimensions;
