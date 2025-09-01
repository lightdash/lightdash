import { FeatureFlags, type MetricQuery } from '@lightdash/common';
import { useMemo, useState } from 'react';
import { useFeatureFlag } from './useFeatureFlagEnabled';

const usePivotDimensions = (
    initialPivotDimensions: string[] | undefined,
    metricQuery?: MetricQuery,
) => {
    const [dirtyPivotDimensions, setPivotDimensions] = useState(
        initialPivotDimensions,
    );

    const { data: useSqlPivotResults } = useFeatureFlag(
        FeatureFlags.UseSqlPivotResults,
    );

    const validPivotDimensions = useMemo(() => {
        if (useSqlPivotResults?.enabled) {
            // If SQL pivot is enabled, we should always use the pivot value and let the backend handle the validation
            return dirtyPivotDimensions;
        }
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
    }, [metricQuery, dirtyPivotDimensions, useSqlPivotResults]);

    return {
        validPivotDimensions,
        setPivotDimensions,
    };
};

export default usePivotDimensions;
