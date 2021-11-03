import { NonIdealState, Spinner } from '@blueprintjs/core';
import React from 'react';
import { useColumns } from '../hooks/useColumns';
import { useExplore } from '../hooks/useExplore';
import { RefreshButton } from './RefreshButton';
import { useExplorer } from '../providers/ExplorerProvider';
import { Section } from '../providers/TrackingProvider';
import { SectionName } from '../types/Events';
import { useQueryResults } from '../hooks/useQueryResults';
import { ResultsTable as Table } from './ResultsTable/ResultsTable';

const EmptyStateNoColumns = () => (
    <div style={{ padding: '50px 0' }}>
        <NonIdealState
            title="Select fields to explore"
            description="Get started by selecting metrics and dimensions."
            icon="hand-left"
        />
    </div>
);

const EmptyStateNoTableData = () => (
    <Section name={SectionName.EMPTY_RESULTS_TABLE}>
        <div style={{ padding: '50px 0' }}>
            <NonIdealState
                description="Click run query to see your results"
                action={<RefreshButton />}
            />
        </div>
    </Section>
);

const EmptyStateExploreLoading = () => (
    <NonIdealState title="Loading tables" icon={<Spinner />} />
);

export const ExplorerResults = () => {
    const dataColumns = useColumns();
    const queryResults = useQueryResults();
    const {
        state: { tableName: activeTableName, columnOrder: explorerColumnOrder },
        actions: { setColumnOrder: setExplorerColumnOrder },
    } = useExplorer();
    const activeExplore = useExplore(activeTableName);
    const safeData = React.useMemo(
        () => (queryResults.status === 'success' ? queryResults.data.rows : []),
        [queryResults.status, queryResults.data],
    );

    if (activeExplore.isLoading) return <EmptyStateExploreLoading />;

    if (dataColumns.length === 0) return <EmptyStateNoColumns />;

    return (
        <Table
            data={safeData}
            dataColumns={dataColumns}
            loading={queryResults.isLoading}
            idle={queryResults.isIdle}
            dataColumnOrder={explorerColumnOrder}
            name={activeTableName}
            onColumnOrderChange={setExplorerColumnOrder}
            idleState={<EmptyStateNoTableData />}
        />
    );
};
