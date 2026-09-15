import {
    ActionIcon,
    Box,
    Burger,
    Button,
    Drawer,
    Group,
    Text,
    useMatches,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { lazy, Suspense, useEffect, type FC } from 'react';
import { Link, useLocation } from 'react-router';
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
import { NavBarPortalContext } from './NavBarPortalContext';
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
    projectName: string | undefined;
};

export const MainNavBarContent: FC<Props> = ({
    activeProjectUuid,
    activeProjectUrlIdentifier,
    isLoadingActiveProject,
    projectName,
}) => {
    const compact = useMatches(
        { base: true, lg: false },
        { getInitialValueInEffect: false },
    );
    const [opened, { toggle, close }] = useDisclosure(false);
    const location = useLocation();
    useEffect(close, [location.key, compact, close]);
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
    const NavGroup = compact ? Group : Button.Group;

    const content = (
        <>
            <Group align="center" className={classes.leftGroup}>
                {!compact && (
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
                )}

                {!isLoadingActiveProject && activeProjectUuid && (
                    <>
                        <NavGroup className={classes.buttonGroup}>
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
                                withLabel={compact}
                            />
                        </NavGroup>
                        {!compact && (
                            <Omnibar projectUuid={activeProjectUuid} />
                        )}
                    </>
                )}
            </Group>

            <Box className={classes.spacer} />

            <Group className={classes.rightGroup}>
                <NavGroup className={classes.buttonGroup}>
                    <SettingsMenu withLabel={compact} />

                    {!isLoadingActiveProject && activeProjectUuid && (
                        <>
                            <LearnLink projectUuid={activeProjectUuid} />
                            <NotificationsMenu
                                projectUuid={activeProjectUuid}
                                withLabel={compact}
                            />
                        </>
                    )}

                    <HelpMenu withLabel={compact} />

                    {headwayEnabled &&
                        !isLoadingActiveProject &&
                        activeProjectUuid && (
                            <HeadwayMenuItem
                                projectUuid={activeProjectUuid}
                                withLabel={compact}
                            />
                        )}

                    <ProjectSwitcher
                        portalTarget={
                            compact
                                ? '#navbar-navigation-content'
                                : '#navbar-header'
                        }
                    />

                    <UserCredentialsSwitcher />
                </NavGroup>

                <UserMenu withLabel={compact} />
            </Group>
        </>
    );

    if (!compact) return content;

    return (
        <>
            <Group w="100%" gap="sm" wrap="nowrap">
                <ActionIcon
                    component={Link}
                    to={homeUrl}
                    aria-label="Home"
                    size="lg"
                    className={classes.logoButton}
                >
                    <Logo />
                </ActionIcon>
                <Text flex={1} miw={0} fw={600} c="white" truncate>
                    {projectName ?? 'Lightdash'}
                </Text>
                {activeProjectUuid && (
                    <Omnibar projectUuid={activeProjectUuid} />
                )}
                <Burger
                    styles={{ root: { minWidth: 44, minHeight: 44 } }}
                    opened={opened}
                    onClick={toggle}
                    size="sm"
                    aria-label={opened ? 'Close navigation' : 'Open navigation'}
                    aria-expanded={opened}
                    aria-controls="navbar-navigation-content"
                />
            </Group>
            <Drawer
                opened={opened}
                onClose={close}
                title={
                    <Text c="white" fw={600}>
                        Navigation
                    </Text>
                }
                position="right"
                closeButtonProps={{ 'aria-label': 'Close navigation' }}
                size="min(100%, 24rem)"
                portalProps={{ target: '#navbar-header' }}
            >
                <NavBarPortalContext.Provider value="#navbar-navigation-content">
                    <Box
                        id="navbar-navigation-content"
                        className={classes.mobileNavigation}
                    >
                        {content}
                    </Box>
                </NavBarPortalContext.Provider>
            </Drawer>
        </>
    );
};
