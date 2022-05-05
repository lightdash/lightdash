import { ApiQueryResults, fieldId } from 'common';
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
            const availableMetricsAndTableCalculations = resultsData
                ? [
                      ...resultsData.metricQuery.metrics,
                      ...(resultsData.metricQuery.additionalMetrics || []).map(
                          (additionalMetric) => fieldId(additionalMetric),
                      ),
                      ...resultsData.metricQuery.tableCalculations.map(
                          ({ name }) => name,
                      ),
                  ]
                : [];
            const availableFields = [
                ...availableDimensions,
                ...availableMetricsAndTableCalculations,
            ];
            if (pivotDimension && availableFields.includes(pivotDimension)) {
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
