import { type MetricQuery } from '@lightdash/common';
import { useMemo, useState } from 'react';

const usePivotDimensions = (
    initialPivotDimensions: string[] | undefined,
    metricQuery?: MetricQuery,
) => {
    const [dirtyPivotDimensions, setPivotDimensions] = useState(
        initialPivotDimensions,
    );

    const validPivotDimensions = useMemo(() => {
        if (metricQuery) {
            const availableDimensions = metricQuery.dimensions;

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
    }, [metricQuery, dirtyPivotDimensions]);

    return {
        validPivotDimensions,
        setPivotDimensions,
    };
};

export default usePivotDimensions;
