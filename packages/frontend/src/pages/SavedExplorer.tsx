import React, { useEffect } from 'react';
import { Card } from '@blueprintjs/core';
import { useHistory, useLocation, useParams } from 'react-router-dom';
import { ExplorePanel } from '../components/ExploreSideBar';
import { Explorer } from '../components/Explorer';
import { useExplorer } from '../providers/ExplorerProvider';
import AboutFooter from '../components/AboutFooter';
import { useSavedQuery } from '../hooks/useSavedQuery';
import { useQueryResults } from '../hooks/useQueryResults';

const SavedExplorer = () => {
    const history = useHistory();
    const location = useLocation<{ fromExplorer?: boolean } | undefined>();
    const pathParams = useParams<{ savedQueryUuid: string }>();
    const {
        state: { tableName },
        actions: { setState, reset },
    } = useExplorer();
    const { data } = useSavedQuery({ id: pathParams.savedQueryUuid });
    const queryResults = useQueryResults();
    const onBack = () => {
        reset();
        history.push({
            pathname: `/saved`,
        });
    };
    useEffect(() => {
        if (
            queryResults.isIdle &&
            pathParams.savedQueryUuid &&
            tableName &&
            !location.state?.fromExplorer
        ) {
            queryResults.refetch();
        }
    }, [pathParams.savedQueryUuid, queryResults, tableName, location]);

    useEffect(() => {
        if (data) {
            setState({
                tableName: data.tableName,
                dimensions: data.metricQuery.dimensions,
                metrics: data.metricQuery.metrics,
                filters: data.metricQuery.filters,
                sorts: data.metricQuery.sorts,
                limit: data.metricQuery.limit,
                columnOrder: data.tableConfig.columnOrder,
                selectedTableCalculations:
                    data.metricQuery.tableCalculations.map((t) => t.name),
                tableCalculations: data.metricQuery.tableCalculations,
            });
        }
    }, [data, setState]);

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
                    width: '400px',
                    marginRight: '10px',
                    overflow: 'hidden',
                    position: 'sticky',
                    top: '50px',
                }}
                elevation={1}
            >
                <div
                    style={{
                        height: '100%',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                    }}
                >
                    <ExplorePanel onBack={onBack} />
                    <AboutFooter />
                </div>
            </Card>
            <div
                style={{
                    padding: '10px 10px',
                    flexGrow: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-start',
                    alignItems: 'stretch',
                }}
            >
                <Explorer savedQueryUuid={pathParams.savedQueryUuid} />
            </div>
        </div>
    );
};

export default SavedExplorer;
