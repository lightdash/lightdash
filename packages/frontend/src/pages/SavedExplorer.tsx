import { useParams } from 'react-router-dom';

import { useEffect } from 'react';
import ErrorState from '../components/common/ErrorState';
import Page from '../components/common/Page/Page';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import Explorer from '../components/Explorer';
import ExplorePanel from '../components/Explorer/ExplorePanel';
import SavedChartsHeader from '../components/Explorer/SavedChartsHeader';
import { useQueryResults } from '../hooks/useQueryResults';
import { useSavedQuery } from '../hooks/useSavedQuery';
import {
    ExploreMode,
    ExplorerProvider,
    ExplorerSection,
} from '../providers/ExplorerProvider';

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
            mode={isEditMode ? ExploreMode.EDIT : ExploreMode.VIEW}
            queryResults={queryResults}
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
