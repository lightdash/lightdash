import { Card, NonIdealState, Spinner } from '@blueprintjs/core';
import React from 'react';
import { useHistory, useParams } from 'react-router-dom';
import AboutFooter from '../components/AboutFooter';
import { Explorer } from '../components/Explorer';
import ExplorePanel from '../components/Explorer/ExplorePanel/index';
import { useSavedQuery } from '../hooks/useSavedQuery';
import { ExplorerProvider } from '../providers/ExplorerProvider';

const SavedExplorer = () => {
    const history = useHistory();
    const pathParams =
        useParams<{ savedQueryUuid: string; projectUuid: string }>();
    const { data, isLoading, error } = useSavedQuery({
        id: pathParams.savedQueryUuid,
    });
    const onBack = () => {
        history.push({
            pathname: `/projects/${pathParams.projectUuid}/home`,
        });
    };

    if (isLoading) {
        return (
            <div style={{ marginTop: '20px' }}>
                <NonIdealState title="Loading..." icon={<Spinner />} />
            </div>
        );
    }
    if (error) {
        return (
            <div style={{ marginTop: '20px' }}>
                <NonIdealState
                    title="Unexpected error"
                    description={error.error.message}
                />
            </div>
        );
    }

    return (
        <ExplorerProvider
            initialState={
                data
                    ? {
                          shouldFetchResults: true,
                          chartName: data?.name,
                          unsavedChartVersion: {
                              tableName: data.tableName,
                              chartConfig: data.chartConfig,
                              metricQuery: data.metricQuery,
                              tableConfig: data.tableConfig,
                              pivotConfig: data.pivotConfig,
                          },
                      }
                    : undefined
            }
            savedChart={data}
        >
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
                    <Explorer />
                </div>
            </div>
        </ExplorerProvider>
    );
};

export default SavedExplorer;
