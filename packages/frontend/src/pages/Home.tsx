import { Stack } from '@mantine/core';
import { FC } from 'react';
import { useParams } from 'react-router-dom';
import { useUnmount } from 'react-use';
import ErrorState from '../components/common/ErrorState';
import Page from '../components/common/Page/Page';
import SpaceBrowser from '../components/Explorer/SpaceBrowser';
import ForbiddenPanel from '../components/ForbiddenPanel';
import LandingPanel from '../components/Home/LandingPanel';
import OnboardingPanel from '../components/Home/OnboardingPanel/index';
import RecentlyUpdatedPanel from '../components/Home/RecentlyUpdatedPanel';
import PageSpinner from '../components/PageSpinner';
import PinnedItemsPanel from '../components/PinnedItemsPanel';
import {
    useOnboardingStatus,
    useProjectSavedChartStatus,
} from '../hooks/useOnboardingStatus';
import { useProject } from '../hooks/useProject';
import { useApp } from '../providers/AppProvider';

const Home: FC = () => {
    const params = useParams<{ projectUuid: string }>();
    const selectedProjectUuid = params.projectUuid;
    const savedChartStatus = useProjectSavedChartStatus(selectedProjectUuid);
    const project = useProject(selectedProjectUuid);
    const onboarding = useOnboardingStatus();

    const { user } = useApp();

    const isLoading =
        onboarding.isLoading || project.isLoading || savedChartStatus.isLoading;
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
        <Page>
            <Stack spacing="xl" w={900}>
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
                        <PinnedItemsPanel
                            projectUuid={project.data.projectUuid}
                            organizationUuid={project.data.organizationUuid}
                        />
                        <SpaceBrowser projectUuid={project.data.projectUuid} />

                        <RecentlyUpdatedPanel
                            projectUuid={project.data.projectUuid}
                        />
                    </>
                )}
            </Stack>
        </Page>
    );
};

export default Home;
