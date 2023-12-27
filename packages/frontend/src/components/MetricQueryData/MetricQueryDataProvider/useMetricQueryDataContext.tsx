import { useContext } from 'react';
import { Context, MetricQueryDataContext } from '.';

export function useMetricQueryDataContext<S extends boolean = false>(
    failSilently?: S,
): S extends false
    ? MetricQueryDataContext
    : MetricQueryDataContext | undefined {
    const context = useContext(Context);

    if (context === undefined && failSilently !== true) {
        throw new Error(
            'useMetricQueryDataContext must be used within a UnderlyingDataProvider',
        );
    }

    return context!;
}
