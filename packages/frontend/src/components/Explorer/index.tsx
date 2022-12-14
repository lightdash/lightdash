import { Button } from '@blueprintjs/core';
import { FC, memo, useEffect } from 'react';
import { useExplore } from '../../hooks/useExplore';
import {
    ExplorerSection,
    useExplorerContext,
} from '../../providers/ExplorerProvider';
import UnderlyingDataModal from '../UnderlyingData/UnderlyingDataModal';
import UnderlyingDataProvider from '../UnderlyingData/UnderlyingDataProvider';
import ExplorerHeader from './ExplorerHeader';
import FiltersCard from './FiltersCard/FiltersCard';
import ResultsCard from './ResultsCard/ResultsCard';
import SqlCard from './SqlCard/SqlCard';
import VisualizationCard from './VisualizationCard/VisualizationCard';

const Explorer: FC = memo(() => {
    const unsavedChartVersionTableName = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableName,
    );
    const unsavedChartVersionFilters = useExplorerContext(
        (context) => context.state.unsavedChartVersion.metricQuery.filters,
    );

    const toggleActiveField = useExplorerContext(
        (context) => context.actions.toggleActiveField,
    );
    const toggleExpandedSection = useExplorerContext(
        (context) => context.actions.toggleExpandedSection,
    );
    const queryResults = useExplorerContext(
        (context) => context.queryResults.data,
    );
    const fetchResults = useExplorerContext(
        (context) => context.actions.fetchResults,
    );

    const tableId = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableName,
    );
    const isValidQuery = useExplorerContext(
        (context) => context.state.isValidQuery,
    );
    const { data } = useExplore(tableId);

    let message;

    switch (tableId) {
        case 'orders':
            message = (
                <p>
                    It looks like you're trying to make a chart about{' '}
                    <b>orders</b>. Why don't you cross <b>Order date</b> and{' '}
                    <b>order amount</b> grouped by <b>status</b>?
                </p>
            );
            break;
        case 'customers':
            message = (
                <p>
                    It looks like you're trying to make a chart about{' '}
                    <b>customers</b>. Why don't you cross <b>created date</b>{' '}
                    and <b>customer count</b>?
                </p>
            );
            break;
    }
    console.log('isValidQuery ', isValidQuery);
    useEffect(() => {
        fetchResults();
    }, [isValidQuery]);
    return isValidQuery || message === undefined ? (
        <>
            <ExplorerHeader />
            <FiltersCard />
            <UnderlyingDataProvider
                filters={unsavedChartVersionFilters}
                tableName={unsavedChartVersionTableName}
            >
                <VisualizationCard />

                <UnderlyingDataModal />
            </UnderlyingDataProvider>
            <ResultsCard />
            <SqlCard />
        </>
    ) : (
        <div
            style={{
                border: '1px dashed blue',
                display: 'flex',
                height: 100,
                padding: 20,
            }}
        >
            <img
                style={{ height: 50 }}
                alt="clippy"
                src="https://i.kym-cdn.com/entries/icons/mobile/000/001/180/5018904-clippy-black-tar-heroin-memes-png-image-transparent-png-free-clippy-transparent-820_502.jpg"
            />
            {message}
            <Button
                style={{ width: 150, height: 25, marginLeft: 20 }}
                onClick={() => {
                    switch (tableId) {
                        case 'orders':
                            toggleActiveField('orders_order_date_day', true);
                            toggleActiveField('orders_status', true);
                            toggleActiveField(
                                'orders_total_order_amount',
                                false,
                            );
                            break;
                        case 'customers':
                            toggleActiveField('customers_created_day', true);
                            toggleActiveField(
                                'customers_unique_customer_count',
                                false,
                            );
                            break;
                    }
                    // Open chart

                    toggleExpandedSection(ExplorerSection.VISUALIZATION);
                }}
            >
                Show me
            </Button>
        </div>
    );
});

export default Explorer;
