import { ApiQueryResults } from '@lightdash/common';
import { useMemo, useState } from 'react';

const usePivotDimensions = (
    initialPivotDimensions: string[] | undefined,
    resultsData: ApiQueryResults | undefined,
) => {
    const [dirtyPivotDimensions, setPivotDimensions] = useState(
        initialPivotDimensions,
    );

    const validPivotDimensions = useMemo(() => {
        if (resultsData) {
            const pivotDimension = dirtyPivotDimensions?.[0];
            const availableDimensions = resultsData
                ? resultsData.metricQuery.dimensions
                : [];
            if (
                pivotDimension &&
                availableDimensions.includes(pivotDimension)
            ) {
                return [pivotDimension];
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
