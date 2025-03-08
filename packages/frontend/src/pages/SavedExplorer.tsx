import { useParams } from 'react-router';

import { ResourceViewItemType } from '@lightdash/common';
import { useCallback, useEffect, useMemo } from 'react';
import Explorer from '../components/Explorer';
import ExplorePanel from '../components/Explorer/ExplorePanel';
import SavedChartsHeader from '../components/Explorer/SavedChartsHeader';
import ErrorState from '../components/common/ErrorState';
import Page from '../components/common/Page/Page';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import useDashboardStorage from '../hooks/dashboard/useDashboardStorage';
import { useChartPinningMutation } from '../hooks/pinning/useChartPinningMutation';
import { usePinnedItems } from '../hooks/pinning/usePinnedItems';
import { useSavedQuery } from '../hooks/useSavedQuery';
import useApp from '../providers/App/useApp';
import ExplorerProvider from '../providers/Explorer/ExplorerProvider';
import { ExplorerSection } from '../providers/Explorer/types';

const SavedExplorer = () => {
    const { health } = useApp();

    const { savedQueryUuid, mode, projectUuid } = useParams<{
        savedQueryUuid: string;
        projectUuid: string;
        mode?: string;
    }>();

    const isEditMode = mode === 'edit';

    const { setDashboardChartInfo } = useDashboardStorage();

    const { data, isInitialLoading, error } = useSavedQuery({
        id: savedQueryUuid,
    });

    const { mutate: togglePinChart } = useChartPinningMutation();
    const { data: pinnedItems } = usePinnedItems(
        projectUuid,
        data?.pinnedListUuid ?? undefined,
    );

    const handleChartPinning = useCallback(() => {
        if (!savedQueryUuid) return;
        togglePinChart({ uuid: savedQueryUuid });
    }, [savedQueryUuid, togglePinChart]);

    const isPinned = useMemo(() => {
        return Boolean(
            pinnedItems?.some(
                (item) =>
                    item.type === ResourceViewItemType.CHART &&
                    item.data.uuid === data?.uuid,
            ),
        );
    }, [data?.uuid, pinnedItems]);

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
                header={
                    <SavedChartsHeader
                        onTogglePin={handleChartPinning}
                        isPinned={isPinned}
                    />
                }
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
