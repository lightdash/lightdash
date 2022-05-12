import { NonIdealState, Spinner } from '@blueprintjs/core';
import React, { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Transition } from 'react-transition-group';
import Explorer from '../components/Explorer';
import ExplorePanel from '../components/Explorer/ExplorePanel/index';
import { useSavedQuery } from '../hooks/useSavedQuery';
import {
    ExplorerProvider,
    ExplorerSection,
} from '../providers/ExplorerProvider';
import {
    CardContent,
    Drawer,
    MainContent,
    PageWrapper,
    StickySidebar,
    WidthHack,
} from './SavedExplorer.styles';
import SavedChartsHeader from '../components/Explorer/SavedChartsHeader';

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
            <PageWrapper>
                <SavedChartsHeader />
                <StickySidebar>
                    <Transition in={isEditMode} timeout={500}>
                        {(state) => (
                            <>
                                <Drawer elevation={1} $state={state}>
                                    <CardContent>
                                        <ExplorePanel />
                                    </CardContent>
                                </Drawer>
                                <WidthHack $state={state}></WidthHack>
                            </>
                        )}
                    </Transition>
                </StickySidebar>
                <MainContent>
                    <Explorer />
                </MainContent>
            </PageWrapper>
        </ExplorerProvider>
    );
};

export default SavedExplorer;
