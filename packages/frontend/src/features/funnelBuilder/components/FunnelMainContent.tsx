import { type FC } from 'react';
import { EventAnalyticsContent } from '../../eventAnalytics/components/EventAnalyticsContent';
import { useAppSelector } from '../store';
import { selectQueryLoading, selectResults } from '../store/funnelBuilderSlice';
import { FunnelBarChart } from './FunnelBarChart';
import { FunnelFilters } from './FunnelFilters';
import { FunnelResultsTable } from './FunnelResultsTable';

type Props = {
    projectUuid: string;
};

export const FunnelMainContent: FC<Props> = ({ projectUuid }) => {
    const results = useAppSelector(selectResults);
    const isLoading = useAppSelector(selectQueryLoading);

    return (
        <EventAnalyticsContent
            filters={<FunnelFilters projectUuid={projectUuid} />}
            isLoading={isLoading}
            hasResults={results !== null}
            sql={results?.sql ?? null}
            emptyMessage={
                <>
                    Choose an explore and at least 2 steps
                    <br />
                    to see your funnel
                </>
            }
            chart={<FunnelBarChart />}
            table={<FunnelResultsTable />}
        />
    );
};
