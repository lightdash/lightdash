import {
    selectDimensions,
    selectMetrics,
    selectTableCalculations,
    useExplorerSelector,
} from '../../features/explorer/store';
import { useExplorerQuery } from '../../hooks/useExplorerQuery';

const sameFields = (a: string[], b: string[]) =>
    a.length === b.length && a.every((field) => b.includes(field));

/** Whether the results on screen were run for a different set of fields. */
export const useIsResultsStale = (): boolean => {
    const { query, isLoading } = useExplorerQuery();
    const dimensions = useExplorerSelector(selectDimensions);
    const metrics = useExplorerSelector(selectMetrics);
    const tableCalculations = useExplorerSelector(selectTableCalculations);

    const lastRun = query.data?.metricQuery;
    if (!lastRun || isLoading) return false;

    return (
        !sameFields(lastRun.dimensions, dimensions) ||
        !sameFields(lastRun.metrics, metrics) ||
        !sameFields(
            lastRun.tableCalculations.map(({ name }) => name),
            tableCalculations.map(({ name }) => name),
        )
    );
};
