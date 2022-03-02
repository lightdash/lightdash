import { ApiQueryResults } from 'common';
import { useEffect, useMemo, useState } from 'react';

const usePivotDimensions = (
    pivotDimensions: string[] | undefined,
    resultsData: ApiQueryResults | undefined,
) => {
    const [dirtyPivotDimensions, setPivotDimensions] =
        useState(pivotDimensions);

    useEffect(() => {
        setPivotDimensions(pivotDimensions);
    }, [pivotDimensions]);

    const validPivotDimensions = useMemo(() => {
        if (resultsData) {
            const pivotDimension = dirtyPivotDimensions?.[0];
            if (
                pivotDimension &&
                resultsData.metricQuery.dimensions.includes(pivotDimension)
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
