import { Card, NonIdealState, Spinner } from '@blueprintjs/core';
import React, { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import Explorer from '../components/Explorer';
import ExplorePanel from '../components/Explorer/ExplorePanel/index';
import SavedChartsHeader from '../components/Explorer/SavedChartsHeader';
import { useSavedQuery } from '../hooks/useSavedQuery';
import {
    ExplorerProvider,
    ExplorerSection,
} from '../providers/ExplorerProvider';
import {
    ExplorerPanelWrapper,
    ExploreSideBarWrapper,
} from './SavedExplorer.styles';

const SavedExplorer = () => {
    const { savedQueryUuid, mode } = useParams<{
        savedQueryUuid: string;
        projectUuid: string;
        mode?: string;
    }>();
    const isEditMode = useMemo(() => mode === 'edit', [mode]);
    const { data, isLoading, error } = useSavedQuery({
        id: savedQueryUuid,
    });

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
            isEditMode={isEditMode}
            initialState={
                data
                    ? {
                          shouldFetchResults: true,
                          expandedSections: [
                              ExplorerSection.VISUALIZATION,
                              ExplorerSection.RESULTS,
                          ],
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
            <SavedChartsHeader />
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
                        height: 'calc(100vh - 120px)',
                        flexBasis: '400px',
                        flexGrow: 0,
                        flexShrink: 0,
                        marginRight: '10px',
                        overflow: 'hidden',
                        position: 'sticky',
                        borderRadius: 0,
                        top: '120px',
                    }}
                    elevation={1}
                >
                    <ExploreSideBarWrapper>
                        <ExplorePanel />
                    </ExploreSideBarWrapper>
                </Card>
                <ExplorerPanelWrapper>
                    <Explorer />
                </ExplorerPanelWrapper>
            </div>
        </ExplorerProvider>
    );
};

export default SavedExplorer;
