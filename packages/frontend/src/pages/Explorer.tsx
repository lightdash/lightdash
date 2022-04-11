import { Card } from '@blueprintjs/core';
import { SavedChart } from 'common';
import React from 'react';
import { useLocation } from 'react-router-dom';
import { Explorer } from '../components/Explorer';
import ExploreSideBar from '../components/Explorer/ExploreSideBar/index';
import { useExplorerRoute } from '../hooks/useExplorerRoute';
import { useExplorer } from '../providers/ExplorerProvider';

const ExplorerPage = () => {
    const location = useLocation<
        { initialQueryData?: SavedChart } | undefined
    >();
    const {
        actions: { setState },
    } = useExplorer();
    useExplorerRoute();
    const initialQueryData = location.state?.initialQueryData;
    if (initialQueryData !== undefined) {
        setState({
            chartName: undefined,
            sorting: true,
            tableName: initialQueryData.tableName,
            dimensions: initialQueryData.metricQuery.dimensions,
            metrics: initialQueryData.metricQuery.metrics,
            filters: initialQueryData.metricQuery.filters,
            sorts: initialQueryData.metricQuery.sorts,
            limit: initialQueryData.metricQuery.limit,
            columnOrder: initialQueryData.tableConfig.columnOrder,
            selectedTableCalculations:
                initialQueryData.metricQuery.tableCalculations.map(
                    (t) => t.name,
                ),
            tableCalculations: initialQueryData.metricQuery.tableCalculations,
        });
    }

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'row',
                flexWrap: 'nowrap',
                justifyContent: 'stretch',
                alignItems: 'flex-start',
            }}
        >
            <Card
                style={{
                    height: 'calc(100vh - 50px)',
                    flexBasis: '400px',
                    flexGrow: 0,
                    flexShrink: 0,
                    marginRight: '10px',
                    overflow: 'hidden',
                    position: 'sticky',
                    top: '50px',
                    paddingBottom: 0,
                }}
                elevation={1}
            >
                <ExploreSideBar />
            </Card>
            <div
                style={{
                    padding: '10px 10px',
                    flexGrow: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-start',
                    alignItems: 'stretch',
                    minWidth: 0,
                }}
            >
                <Explorer />
            </div>
        </div>
    );
};

export default ExplorerPage;
