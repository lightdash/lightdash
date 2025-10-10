import { type FC } from 'react';
import { useParams } from 'react-router';
import { useUnmount } from 'react-use';
import ForbiddenPanel from '../components/ForbiddenPanel';
import LandingPanel from '../components/Home/LandingPanel';
import { MostPopularAndRecentlyUpdatedPanel } from '../components/Home/MostPopularAndRecentlyUpdatedPanel';
import OnboardingPanel from '../components/Home/OnboardingPanel/index';
import PageSpinner from '../components/PageSpinner';
import PinnedItemsPanel from '../components/PinnedItemsPanel';
import ErrorState from '../components/common/ErrorState';
import Page from '../components/common/Page/Page';
import AiSearchBox from '../ee/components/Home/AiSearchBox';

import { subject } from '@casl/ability';
import { Stack } from '@mantine-8/core';
import { useAiAgentButtonVisibility } from '../ee/features/aiCopilot/hooks/useAiAgentsButtonVisibility';
import { usePinnedItems } from '../hooks/pinning/usePinnedItems';
import { useOnboardingStatus } from '../hooks/useOnboardingStatus';
import {
    useMostPopularAndRecentlyUpdated,
    useProject,
} from '../hooks/useProject';
import useApp from '../providers/App/useApp';
import { PinnedItemsProvider } from '../providers/PinnedItems/PinnedItemsProvider';

const Home: FC = () => {
    const params = useParams<{ projectUuid: string }>();
    const selectedProjectUuid = params.projectUuid;
    const project = useProject(selectedProjectUuid);
    const onboarding = useOnboardingStatus();
    const pinnedItems = usePinnedItems(
        selectedProjectUuid,
        project.data?.pinnedListUuid,
    );
    const {
        data: mostPopularAndRecentlyUpdated,
        isInitialLoading: isMostPopularAndRecentlyUpdatedLoading,
    } = useMostPopularAndRecentlyUpdated(selectedProjectUuid);

    const { user } = useApp();
    const isAiAgentsEnabled = useAiAgentButtonVisibility();

    const isLoading =
        onboarding.isInitialLoading ||
        project.isInitialLoading ||
        isMostPopularAndRecentlyUpdatedLoading ||
        pinnedItems.isInitialLoading;

    const error = onboarding.error || project.error;

    useUnmount(() => onboarding.remove());

    if (isLoading) {
        return <PageSpinner />;
    }

    if (error) {
        return <ErrorState error={error.error} />;
    }

    if (!project.data || !onboarding.data) {
        return <ErrorState />;
    }

    if (user.data?.ability?.cannot('view', subject('Project', project.data))) {
        return <ForbiddenPanel />;
    }

    return (
        <Page withFixedContent withPaddedContent withFooter>
            <Stack gap="xl">
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
                        {isAiAgentsEnabled && (
                            <AiSearchBox
                                projectUuid={project.data.projectUuid}
                            />
                        )}
                        <PinnedItemsProvider
                            organizationUuid={project.data.organizationUuid}
                            projectUuid={project.data.projectUuid}
                            pinnedListUuid={project.data.pinnedListUuid || ''}
                            allowDelete={false}
                        >
                            <PinnedItemsPanel
                                pinnedItems={pinnedItems.data ?? []}
                                isEnabled={Boolean(
                                    mostPopularAndRecentlyUpdated?.mostPopular
                                        .length ||
                                        mostPopularAndRecentlyUpdated
                                            ?.recentlyUpdated.length,
                                )}
                            />
                        </PinnedItemsProvider>
                        <MostPopularAndRecentlyUpdatedPanel
                            data={mostPopularAndRecentlyUpdated}
                            projectUuid={project.data.projectUuid}
                        />
                    </>
                )}
            </Stack>
        </Page>
    );
};

export default Home;
