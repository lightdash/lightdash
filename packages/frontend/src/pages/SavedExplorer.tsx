import { Box } from '@mantine/core';
import { FC, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import ErrorState from '../components/common/ErrorState';
import Page from '../components/common/Page/Page';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import Explorer from '../components/Explorer';
import ExplorePanel from '../components/Explorer/ExplorePanel';
import SavedChartsHeader from '../components/Explorer/SavedChartsHeader';
import { useQueryResults } from '../hooks/useQueryResults';
import { useSavedQuery } from '../hooks/useSavedQuery';
import {
    ExplorerProvider,
    ExplorerSection,
    useExplorerContext,
} from '../providers/ExplorerProvider';

const SavedExplorerPage: FC<{
    name: string | undefined;
    isEditMode: boolean;
}> = ({ name, isEditMode }) => {
    const expandedSections = useExplorerContext(
        (context) => context.state.expandedSections,
    );

    return (
        <Page
            title={name}
            header={<SavedChartsHeader />}
            sidebar={<ExplorePanel />}
            isSidebarOpen={isEditMode}
            withFullHeight
            withPaddedContent
            rightSidebar={<Box id="right-sidebar"></Box>}
            isRightSidebarOpen={expandedSections.includes(
                ExplorerSection.VISUALIZATION_RIGHT_SIDEBAR,
            )}
        >
            <Explorer />
        </Page>
    );
};

const SavedExplorer = () => {
    const { savedQueryUuid, mode } = useParams<{
        savedQueryUuid: string;
        projectUuid: string;
        mode?: string;
    }>();

    const isEditMode = mode === 'edit';

    const { data, isInitialLoading, error } = useSavedQuery({
        id: savedQueryUuid,
    });

    const queryResults = useQueryResults({
        chartUuid: savedQueryUuid,
        isViewOnly: !isEditMode,
    });

    useEffect(() => {
        if (data && data.dashboardUuid && data.dashboardName) {
            sessionStorage.setItem('fromDashboard', data.dashboardName);
            sessionStorage.setItem('dashboardUuid', data.dashboardUuid);
        }
    }, [data]);

    if (isInitialLoading) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState title="Loading..." loading />
            </div>
        );
    }
    if (error) {
        return <ErrorState error={error.error} />;
    }

    return (
        <ExplorerProvider
            queryResults={queryResults}
            isEditMode={isEditMode}
            initialState={
                data
                    ? {
                          shouldFetchResults: true,
                          expandedSections: [ExplorerSection.VISUALIZATION],
                          unsavedChartVersion: {
                              tableName: data.tableName,
                              chartConfig: data.chartConfig,
                              metricQuery: data.metricQuery,
                              tableConfig: data.tableConfig,
                              pivotConfig: data.pivotConfig,
                          },
                          modals: {
                              additionalMetric: {
                                  isOpen: false,
                              },
                              customDimension: {
                                  isOpen: false,
                              },
                          },
                      }
                    : undefined
            }
            savedChart={data}
        >
            <SavedExplorerPage name={data?.name} isEditMode={isEditMode} />
        </ExplorerProvider>
    );
};

export default SavedExplorer;
