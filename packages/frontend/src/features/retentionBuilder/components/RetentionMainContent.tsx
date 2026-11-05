import { type FC } from 'react';
import { EventAnalyticsContent } from '../../eventAnalytics/components/EventAnalyticsContent';
import { useAppSelector } from '../store';
import {
    selectQueryLoading,
    selectResults,
} from '../store/retentionBuilderSlice';
import { RetentionCurveChart } from './RetentionCurveChart';
import { RetentionFilters } from './RetentionFilters';
import { RetentionTable } from './RetentionTable';

type Props = {
    projectUuid: string;
};

export const RetentionMainContent: FC<Props> = ({ projectUuid }) => {
    const results = useAppSelector(selectResults);
    const isLoading = useAppSelector(selectQueryLoading);

    return (
        <EventAnalyticsContent
            filters={<RetentionFilters projectUuid={projectUuid} />}
            isLoading={isLoading}
            hasResults={results !== null}
            sql={results?.sql ?? null}
            emptyMessage={
                <>
                    Choose an explore and a starting event
                    <br />
                    to see retention
                </>
            }
            chart={<RetentionCurveChart />}
            table={<RetentionTable />}
        />
    );
};
