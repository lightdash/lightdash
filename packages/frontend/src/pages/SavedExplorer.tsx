import { memo, useEffect } from 'react';
import { Provider } from 'react-redux';
import { useParams } from 'react-router';
import ErrorState from '../components/common/ErrorState';
import Page from '../components/common/Page/Page';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import Explorer from '../components/Explorer';
import ExplorePanel from '../components/Explorer/ExplorePanel';
import SavedChartsHeader from '../components/Explorer/SavedChartsHeader';
import { explorerStore } from '../features/explorer/store';
import useDashboardStorage from '../hooks/dashboard/useDashboardStorage';
import { useExplorerQueryManager } from '../hooks/useExplorerQueryManager';
import { useSavedQuery } from '../hooks/useSavedQuery';
import useApp from '../providers/App/useApp';
import { defaultQueryExecution } from '../providers/Explorer/defaultState';
import ExplorerProvider from '../providers/Explorer/ExplorerProvider';
import { ExplorerSection } from '../providers/Explorer/types';

const SavedExplorerContent = memo<{
    viewModeQueryArgs?: { chartUuid: string; context?: string };
    isEditMode: boolean;
}>(({ viewModeQueryArgs, isEditMode }) => {
    // Run the query manager hook - orchestrates all query effects
    useExplorerQueryManager(
        viewModeQueryArgs,
        undefined, // dateZoomGranularity
        undefined, // projectUuid - will be inferred from URL params
        false, // minimal
    );

    return (
        <Page
            title={undefined} // Will be set by SavedChartsHeader
            header={<SavedChartsHeader />}
            sidebar={<ExplorePanel />}
            isSidebarOpen={isEditMode}
            withFullHeight
            withPaddedContent
        >
            <Explorer />
        </Page>
    );
});

const SavedExplorer = () => {
    const { health } = useApp();

    const { savedQueryUuid, mode } = useParams<{
        savedQueryUuid: string;
        projectUuid: string;
        mode?: string;
    }>();

    const isEditMode = mode === 'edit';

    const { setDashboardChartInfo } = useDashboardStorage();

    const { data, isInitialLoading, error } = useSavedQuery({
        id: savedQueryUuid,
    });

    useEffect(() => {
        // If the saved explore is part of a dashboard, set the dashboard chart info
        // so we can show the banner + the user can navigate back to the dashboard easily
        if (data && data.dashboardUuid && data.dashboardName) {
            setDashboardChartInfo({
                name: data.dashboardName,
                dashboardUuid: data.dashboardUuid,
            });
        }
    }, [data, setDashboardChartInfo]);

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
        <Provider store={explorerStore}>
            <ExplorerProvider
                isEditMode={isEditMode}
                initialState={
                    data
                        ? {
                              isEditMode,
                              parameterReferences: Object.keys(
                                  data.parameters ?? {},
                              ),
                              parameterDefinitions: {},
                              expandedSections: [ExplorerSection.VISUALIZATION],
                              unsavedChartVersion: {
                                  tableName: data.tableName,
                                  chartConfig: data.chartConfig,
                                  metricQuery: data.metricQuery,
                                  tableConfig: data.tableConfig,
                                  pivotConfig: data.pivotConfig,
                                  parameters: data.parameters,
                              },
                              modals: {
                                  format: {
                                      isOpen: false,
                                  },
                                  additionalMetric: {
                                      isOpen: false,
                                  },
                                  customDimension: {
                                      isOpen: false,
                                  },
                                  writeBack: {
                                      isOpen: false,
                                  },
                              },
                              queryExecution: defaultQueryExecution,
                          }
                        : undefined
                }
                savedChart={data}
                defaultLimit={health.data?.query.defaultLimit}
            >
                <SavedExplorerContent
                    viewModeQueryArgs={
                        savedQueryUuid
                            ? { chartUuid: savedQueryUuid }
                            : undefined
                    }
                    isEditMode={isEditMode}
                />
            </ExplorerProvider>
        </Provider>
    );
};

export default SavedExplorer;
