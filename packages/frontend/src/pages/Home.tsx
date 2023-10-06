import { Stack } from '@mantine/core';
import { FC } from 'react';
import { useParams } from 'react-router-dom';
import { useUnmount } from 'react-use';
import ErrorState from '../components/common/ErrorState';
import Page from '../components/common/Page/Page';
import ForbiddenPanel from '../components/ForbiddenPanel';
import LandingPanel from '../components/Home/LandingPanel';
import OnboardingPanel from '../components/Home/OnboardingPanel/index';
import RecentlyUpdatedPanel from '../components/Home/RecentlyUpdatedPanel';
import PageSpinner from '../components/PageSpinner';
import PinnedItemsPanel from '../components/PinnedItemsPanel';
import { useRecentlyUpdatedDashboards } from '../hooks/dashboard/useDashboards';
import { usePinnedItems } from '../hooks/pinning/usePinnedItems';
import {
    useOnboardingStatus,
    useProjectSavedChartStatus,
} from '../hooks/useOnboardingStatus';
import { useProject } from '../hooks/useProject';
import { useSavedCharts } from '../hooks/useSpaces';
import { useApp } from '../providers/AppProvider';
import { PinnedItemsProvider } from '../providers/PinnedItemsProvider';

const Home: FC = () => {
    const params = useParams<{ projectUuid: string }>();
    const selectedProjectUuid = params.projectUuid;
    const savedChartStatus = useProjectSavedChartStatus(selectedProjectUuid);
    const project = useProject(selectedProjectUuid);
    const onboarding = useOnboardingStatus();

    const { data: pinnedItems = [], isLoading: pinnedItemsLoading } =
        usePinnedItems(selectedProjectUuid, project.data?.pinnedListUuid);

    const { data: dashboards = [], isLoading: dashboardsLoading } =
        useRecentlyUpdatedDashboards(selectedProjectUuid);
    // only used for recently updated panel - could be faster
    const { data: savedCharts = [], isLoading: chartsLoading } =
        useSavedCharts(selectedProjectUuid);
    // -----

    const { user } = useApp();

    const isLoading =
        onboarding.isLoading ||
        project.isLoading ||
        savedChartStatus.isLoading ||
        dashboardsLoading ||
        chartsLoading ||
        pinnedItemsLoading;
    const error = onboarding.error || project.error || savedChartStatus.error;

    useUnmount(() => onboarding.remove());

    if (user.data?.ability?.cannot('view', 'SavedChart')) {
        return <ForbiddenPanel />;
    }

    if (isLoading) {
        return <PageSpinner />;
    }

    if (error) {
        return <ErrorState error={error.error} />;
    }

    if (!project.data || !onboarding.data) {
        return <ErrorState />;
    }

    return (
        <Page withFixedContent withPaddedContent withFooter>
            <Stack spacing="xl">
                {!onboarding.data.ranQuery ? (
                    <OnboardingPanel
                        projectUuid={project.data.projectUuid}
                        userName={user.data?.firstName}
                    />
                ) : (
                    <>
                        <LandingPanel
                            userName={user.data?.firstName}
                            projectUuid={project.data.projectUuid}
                        />
                        <PinnedItemsProvider
                            organizationUuid={project.data.organizationUuid}
                            projectUuid={project.data.projectUuid}
                            pinnedListUuid={project.data.pinnedListUuid || ''}
                        >
                            <PinnedItemsPanel
                                pinnedItems={pinnedItems}
                                dashboards={dashboards}
                                savedCharts={savedCharts}
                            />
                        </PinnedItemsProvider>
                        <RecentlyUpdatedPanel
                            data={{ dashboards, savedCharts }}
                            projectUuid={project.data.projectUuid}
                        />
                    </>
                )}
            </Stack>
        </Page>
    );
};

export default Home;
