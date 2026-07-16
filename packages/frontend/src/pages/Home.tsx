import { subject } from '@casl/ability';
import { DbtProjectType, ProjectType } from '@lightdash/common';
import { Stack } from '@mantine-8/core';
import { type FC } from 'react';
import { Navigate, useParams } from 'react-router';
import { useUnmount } from 'react-use';
import ErrorState from '../components/common/ErrorState';
import Page from '../components/common/Page/Page';
import ForbiddenPanel from '../components/ForbiddenPanel';
import { HomepageContentPanel } from '../components/Home/HomepageContentPanel';
import LandingPanel from '../components/Home/LandingPanel';
import OnboardingPanel from '../components/Home/OnboardingPanel/index';
import PageSpinner from '../components/PageSpinner';
import PinnedAndFavoritesSection from '../components/PinnedAndFavoritesSection';
import AiSearchBox from '../ee/components/Home/AiSearchBox';
import { useAiAgentButtonVisibility } from '../ee/features/aiCopilot/hooks/useAiAgentsButtonVisibility';
import { useIsCopilotEnabled } from '../ee/features/aiCopilot/hooks/useIsCopilotEnabled';
import { AdminHomepageControls } from '../ee/features/homepageBuilder/AdminHomepageControls';
import { PersonalFavoritesBar } from '../ee/features/homepageBuilder/blocks/FavoritesBlock';
import { DayOneHomepage } from '../ee/features/homepageBuilder/DayOneHomepage';
import {
    useHomepageBuilderFlag,
    useResolvedHomepage,
} from '../ee/features/homepageBuilder/hooks/useProjectHomepage';
import { PublishedHomepage } from '../ee/features/homepageBuilder/PublishedHomepage';
import { ManagedAgentHomeCard } from '../ee/features/managedAgent/ManagedAgentHomeCard';
import { useFavorites } from '../hooks/favorites/useFavorites';
import { usePinnedItems } from '../hooks/pinning/usePinnedItems';
import { useOnboardingStatus } from '../hooks/useOnboardingStatus';
import {
    useMostPopularAndRecentlyUpdated,
    useProject,
} from '../hooks/useProject';
import useApp from '../providers/App/useApp';
import { FavoritesProvider } from '../providers/Favorites/FavoritesProvider';
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
    const favorites = useFavorites(selectedProjectUuid);
    const {
        data: mostPopularAndRecentlyUpdated,
        isInitialLoading: isMostPopularAndRecentlyUpdatedLoading,
    } = useMostPopularAndRecentlyUpdated(selectedProjectUuid);

    const { user } = useApp();
    const isAiAgentsEnabled = useAiAgentButtonVisibility();
    const { isEnabled: isHomepageBuilderFlagEnabled } =
        useHomepageBuilderFlag();
    const { isCopilotEnabled, isLoading: isCopilotLoading } =
        useIsCopilotEnabled();
    // The builder's centerpiece is the AI hero, so without copilot it is a
    // degraded experience — fall back to the classic homepage and hide the
    // builder/customization until that is addressed.
    const isHomepageBuilderEnabled =
        isHomepageBuilderFlagEnabled && isCopilotEnabled;
    const resolvedHomepage = useResolvedHomepage(selectedProjectUuid, {
        enabled: isHomepageBuilderEnabled,
    });

    const isLoading =
        onboarding.isInitialLoading ||
        project.isInitialLoading ||
        isMostPopularAndRecentlyUpdatedLoading ||
        pinnedItems.isInitialLoading ||
        favorites.isInitialLoading ||
        isCopilotLoading;

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

    const isGitHubProject =
        project.data.type !== ProjectType.PREVIEW &&
        project.data.dbtConnection.type === DbtProjectType.GITHUB;

    if (
        isHomepageBuilderEnabled &&
        resolvedHomepage.data?.type === 'dashboard'
    ) {
        return (
            <Navigate
                to={`/projects/${project.data.projectUuid}/dashboards/${resolvedHomepage.data.dashboardUuid}/view`}
                replace
            />
        );
    }

    if (
        isHomepageBuilderEnabled &&
        resolvedHomepage.data?.type === 'homepage'
    ) {
        const { homepage } = resolvedHomepage.data;
        const hasFavoritesBlock = homepage.config.rows.some((row) =>
            row.blocks.some((block) => block.type === 'favorites'),
        );
        return (
            <Page withFooter noContentPadding>
                <AdminHomepageControls
                    projectUuid={project.data.projectUuid}
                    organizationUuid={project.data.organizationUuid}
                    showNewHomepage
                />
                <PublishedHomepage
                    config={homepage.config}
                    projectUuid={project.data.projectUuid}
                    topBar={
                        homepage.allowPersonal && !hasFavoritesBlock ? (
                            <PersonalFavoritesBar
                                projectUuid={project.data.projectUuid}
                            />
                        ) : null
                    }
                />
            </Page>
        );
    }

    if (
        isHomepageBuilderEnabled &&
        resolvedHomepage.data === null &&
        onboarding.data.ranQuery
    ) {
        return (
            <Page withFooter noContentPadding>
                <AdminHomepageControls
                    projectUuid={project.data.projectUuid}
                    organizationUuid={project.data.organizationUuid}
                />
                <FavoritesProvider projectUuid={project.data.projectUuid}>
                    <PinnedItemsProvider
                        organizationUuid={project.data.organizationUuid}
                        projectUuid={project.data.projectUuid}
                        pinnedListUuid={project.data.pinnedListUuid || ''}
                        allowDelete={false}
                    >
                        <DayOneHomepage
                            projectUuid={project.data.projectUuid}
                            projectName={project.data.name}
                            pinnedItems={pinnedItems.data ?? []}
                            favoriteItems={favorites.data ?? []}
                            pinnedIsEnabled={Boolean(
                                mostPopularAndRecentlyUpdated?.mostPopular
                                    .length ||
                                mostPopularAndRecentlyUpdated?.recentlyUpdated
                                    .length,
                            )}
                        />
                    </PinnedItemsProvider>
                </FavoritesProvider>
            </Page>
        );
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
                    <FavoritesProvider projectUuid={project.data.projectUuid}>
                        <LandingPanel
                            userName={user.data?.firstName}
                            projectUuid={project.data.projectUuid}
                        />
                        {project.data.type !== ProjectType.PREVIEW && (
                            <ManagedAgentHomeCard
                                projectUuid={project.data.projectUuid}
                            />
                        )}
                        {isAiAgentsEnabled && (
                            <AiSearchBox
                                projectUuid={project.data.projectUuid}
                                showAiReviewsPromo={isGitHubProject}
                            />
                        )}
                        <PinnedItemsProvider
                            organizationUuid={project.data.organizationUuid}
                            projectUuid={project.data.projectUuid}
                            pinnedListUuid={project.data.pinnedListUuid || ''}
                            allowDelete={false}
                        >
                            <PinnedAndFavoritesSection
                                pinnedItems={pinnedItems.data ?? []}
                                favoriteItems={favorites.data ?? []}
                                pinnedIsEnabled={Boolean(
                                    mostPopularAndRecentlyUpdated?.mostPopular
                                        .length ||
                                    mostPopularAndRecentlyUpdated
                                        ?.recentlyUpdated.length,
                                )}
                            />
                        </PinnedItemsProvider>
                        <HomepageContentPanel
                            data={mostPopularAndRecentlyUpdated}
                            projectUuid={project.data.projectUuid}
                        />
                    </FavoritesProvider>
                )}
            </Stack>
        </Page>
    );
};

export default Home;
