import { useEffect } from 'react';
import { useParams } from 'react-router';
import Explorer from '../components/Explorer';
import ExplorePanel from '../components/Explorer/ExplorePanel';
import SavedChartsHeader from '../components/Explorer/SavedChartsHeader';
import ErrorState from '../components/common/ErrorState';
import Page from '../components/common/Page/Page';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import useDashboardStorage from '../hooks/dashboard/useDashboardStorage';
import { useSavedQuery } from '../hooks/useSavedQuery';
import useApp from '../providers/App/useApp';
import ExplorerProvider from '../providers/Explorer/ExplorerProvider';
import { ExplorerSection } from '../providers/Explorer/types';

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
        <ExplorerProvider
            isEditMode={isEditMode}
            viewModeQueryArgs={
                savedQueryUuid ? { chartUuid: savedQueryUuid } : undefined
            }
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
                      }
                    : undefined
            }
            savedChart={data}
            defaultLimit={health.data?.query.defaultLimit}
        >
            <Page
                title={data?.name}
                header={<SavedChartsHeader />}
                sidebar={<ExplorePanel />}
                isSidebarOpen={isEditMode}
                withFullHeight
                withPaddedContent
            >
                <Explorer />
            </Page>
        </ExplorerProvider>
    );
};

export default SavedExplorer;
