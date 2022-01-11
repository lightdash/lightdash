import { Card } from '@blueprintjs/core';
import React, { useEffect } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import AboutFooter from '../components/AboutFooter';
import { Explorer } from '../components/Explorer';
import { ExplorePanel } from '../components/ExploreSideBar';
import { useSavedQuery } from '../hooks/useSavedQuery';
import { useExplorer } from '../providers/ExplorerProvider';

const SavedExplorer = () => {
    const history = useHistory();
    const pathParams = useParams<{ savedQueryUuid: string }>();

    const {
        actions: { setState, reset },
    } = useExplorer();
    const { data } = useSavedQuery({ id: pathParams.savedQueryUuid });
    const onBack = () => {
        reset();
        history.push({
            pathname: `/saved`,
        });
    };

    useEffect(() => {
        if (data) {
            setState({
                chartName: data.name,
                sorting: false,
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
                <div
                    style={{
                        height: '100%',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                    }}
                >
                    <ExplorePanel onBack={onBack} />
                    <AboutFooter minimal />
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
                    minWidth: 0,
                }}
            >
                <Explorer savedQueryUuid={pathParams.savedQueryUuid} />
            </div>
        </div>
    );
};

export default SavedExplorer;
