import { ActionIcon, Box, Button, Group } from '@mantine/core';
import { lazy, Suspense, type FC } from 'react';
import { Link } from 'react-router';
import { LearnLink } from '../../features/learn/LearnLink';
import { useHasMetricsInCatalog } from '../../features/metricsCatalog/hooks/useMetricsCatalog';
import Omnibar from '../../features/omnibar';
import { useOptionalProjectRoute } from '../../hooks/useProjectRoute';
import useApp from '../../providers/App/useApp';
import Logo from '../../svgs/logo-icon.svg?react';
import { AutopilotNavButton } from './AutopilotNavButton';
import BrowseMenu from './BrowseMenu';
import ExploreMenu from './ExploreMenu';
import HeadwayMenuItem from './HeadwayMenuItem';
import HelpMenu from './HelpMenu';
import classes from './MainNavBarContent.module.css';
import { MetricsLink } from './MetricsLink';
import { NotificationsMenu } from './NotificationsMenu';
import ProjectSwitcher from './ProjectSwitcher';
import SettingsMenu from './SettingsMenu';
import UserCredentialsSwitcher from './UserCredentialsSwitcher';
import UserMenu from './UserMenu';

const AiAgentsButton = lazy(() =>
    import('./AiAgentsButton').then((module) => ({
        default: module.AiAgentsButton,
    })),
);

type Props = {
    activeProjectUuid: string | undefined;
    activeProjectUrlIdentifier: string | undefined;
    isLoadingActiveProject: boolean;
};

export const MainNavBarContent: FC<Props> = ({
    activeProjectUuid,
    activeProjectUrlIdentifier,
    isLoadingActiveProject,
}) => {
    const projectRoute = useOptionalProjectRoute();
    const projectUrlIdentifier =
        projectRoute?.projectUrlIdentifier ?? activeProjectUrlIdentifier;
    const homeUrl = activeProjectUuid
        ? `/projects/${projectUrlIdentifier}/home`
        : '/';
    const { data: hasMetrics } = useHasMetricsInCatalog({
        projectUuid: activeProjectUuid,
    });
    const { health } = useApp();
    const headwayEnabled = health.data?.headway?.enabled;

    return (
        <>
            <Group align="center" className={classes.leftGroup}>
                <ActionIcon
                    component={Link}
                    to={homeUrl}
                    // Navigation anchor for scope walkthroughs (data-tour-via)
                    data-tour-nav="home"
                    data-tour-hint="Click the Lightdash logo to go back home"
                    // Also the action of the view:PinnedItems walkthrough:
                    // the homepage is where pinned content waits, and the
                    // pinned item picked after it is what gets opened.
                    // See scripts/scope-tours.
                    data-tour-scope="view:PinnedItems"
                    data-tour-step="2"
                    data-tour-route="/projects/:projectUuid/dashboards"
                    data-tour-label="Click the Lightdash logo to go back home"
                    data-tour-title="Find pinned content on the homepage"
                    data-tour-interactive="true"
                    data-tour-via='[data-tour-nav="browse"] >> [data-tour-nav="all-dashboards"]'
                    data-tour-then='[data-tour-anchor="pinned-item"][data-tour-value="Jaffle Shop overview"]'
                    data-tour-docs="explore/search.mdx#browsing-instead-of-searching:p2:1"
                    title="Home"
                    className={classes.logoButton}
                >
                    <Logo />
                </ActionIcon>

                {!isLoadingActiveProject && activeProjectUuid && (
                    <>
                        <Button.Group>
                            <ExploreMenu
                                projectUuid={activeProjectUuid}
                                projectUrlIdentifier={projectUrlIdentifier}
                            />
                            <BrowseMenu projectUuid={activeProjectUuid} />
                            {hasMetrics && (
                                <MetricsLink projectUuid={activeProjectUuid} />
                            )}
                            <Suspense fallback={null}>
                                <AiAgentsButton
                                    projectUuid={activeProjectUuid}
                                />
                            </Suspense>
                            <AutopilotNavButton
                                projectUuid={activeProjectUuid}
                            />
                        </Button.Group>
                        <Omnibar projectUuid={activeProjectUuid} />
                    </>
                )}
            </Group>

            <Box className={classes.spacer} />

            <Group className={classes.rightGroup}>
                <Button.Group>
                    <SettingsMenu />

                    {!isLoadingActiveProject && activeProjectUuid && (
                        <>
                            <LearnLink projectUuid={activeProjectUuid} />
                            <NotificationsMenu
                                projectUuid={activeProjectUuid}
                            />
                        </>
                    )}

                    <HelpMenu />

                    {headwayEnabled &&
                        !isLoadingActiveProject &&
                        activeProjectUuid && (
                            <HeadwayMenuItem projectUuid={activeProjectUuid} />
                        )}

                    <ProjectSwitcher portalTarget="#navbar-header" />

                    <UserCredentialsSwitcher />
                </Button.Group>

                <UserMenu />
            </Group>
        </>
    );
};
