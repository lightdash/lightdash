import { Button } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { type FC } from 'react';
import {
    selectDimensions,
    selectMetrics,
    selectTableCalculations,
    useExplorerSelector,
} from '../../features/explorer/store';
import { useMergeSetup } from '../../features/mergeQuery/hooks/useMergeSetup';
import { useExplorerQuery } from '../../hooks/useExplorerQuery';
import MantineIcon from '../common/MantineIcon';

const sameFields = (a: string[], b: string[]) =>
    a.length === b.length && a.every((field) => b.includes(field));

/**
 * Says the results on screen were run for a different set of fields, and
 * runs the query for the current ones.
 */
const StaleResultsNotice: FC = () => {
    const { query, isLoading, fetchResults } = useExplorerQuery();
    const dimensions = useExplorerSelector(selectDimensions);
    const metrics = useExplorerSelector(selectMetrics);
    const tableCalculations = useExplorerSelector(selectTableCalculations);
    const merge = useMergeSetup();

    const lastRun = query.data?.metricQuery;
    // ponytail: a merge runs through its own button, so no notice there yet
    if (!lastRun || isLoading || merge.isMerging) return null;

    const isStale =
        !sameFields(lastRun.dimensions, dimensions) ||
        !sameFields(lastRun.metrics, metrics) ||
        !sameFields(
            lastRun.tableCalculations.map(({ name }) => name),
            tableCalculations.map(({ name }) => name),
        );
    if (!isStale) return null;

    return (
        <Button
            size="compact-xs"
            variant="light"
            leftSection={<MantineIcon icon={IconRefresh} size={12} />}
            onClick={fetchResults}
        >
            Fields changed, run query
        </Button>
    );
};

export default StaleResultsNotice;
