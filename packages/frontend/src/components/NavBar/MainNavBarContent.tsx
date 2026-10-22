import { ActionIcon, Box, Button, Drawer, Group, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconHome, IconMenu2 } from '@tabler/icons-react';
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
import {
    MOBILE_NAVIGATION_PORTAL_TARGET,
    NavBarPortalContext,
    revealInlineNavMenuOnToggle,
} from './NavBarPortalContext';
import { NotificationsMenu } from './NotificationsMenu';
import ProjectCredentialsSwitcher from './ProjectCredentialsSwitcher';
import ProjectSwitcher from './ProjectSwitcher';
import SettingsMenu from './SettingsMenu';
import { useCompactNavigation } from './useCompactNavigation';
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
    const compact = useCompactNavigation();
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
                {compact && (
                    <Text className={classes.sectionLabel}>Workspace</Text>
                )}
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
                            {compact && (
                                <>
                                    <Button
                                        component={Link}
                                        to={homeUrl}
                                        leftSection={<IconHome size={20} />}
                                        variant="subtle"
                                    >
                                        Home
                                    </Button>
                                    <ProjectSwitcher
                                        portalTarget={
                                            MOBILE_NAVIGATION_PORTAL_TARGET
                                        }
                                    />
                                </>
                            )}
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
                {compact && <Text className={classes.sectionLabel}>More</Text>}
                <NavGroup className={classes.buttonGroup}>
                    <SettingsMenu withLabel={compact} />

                    {!isLoadingActiveProject && activeProjectUuid && (
                        <>
                            <LearnLink
                                projectUuid={activeProjectUuid}
                                withLabel={compact}
                            />
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

                    {!compact && (
                        <ProjectSwitcher portalTarget="#navbar-header" />
                    )}

                    <ProjectCredentialsSwitcher />
                </NavGroup>

                <UserMenu withLabel={compact} />
            </Group>
        </>
    );

    if (!compact) return content;

    return (
        <>
            <Group
                className={classes.compactHeader}
                w="100%"
                gap="xs"
                wrap="nowrap"
            >
                <ActionIcon
                    component={Link}
                    to={homeUrl}
                    aria-label="Home"
                    size="lg"
                    className={classes.logoButton}
                >
                    <Logo />
                </ActionIcon>
                <Group className={classes.compactActions} gap={0} wrap="nowrap">
                    {activeProjectUuid && (
                        <>
                            <Omnibar projectUuid={activeProjectUuid} />
                            <Suspense fallback={null}>
                                <Box className={classes.compactAiButton}>
                                    <AiAgentsButton
                                        projectUuid={activeProjectUuid}
                                    />
                                </Box>
                            </Suspense>
                        </>
                    )}
                    <ActionIcon
                        className={classes.menuButton}
                        variant="subtle"
                        size="lg"
                        onClick={toggle}
                        aria-label={
                            opened ? 'Close navigation' : 'Open navigation'
                        }
                        aria-expanded={opened}
                        aria-controls="navbar-navigation-content"
                    >
                        <IconMenu2 size={20} />
                    </ActionIcon>
                </Group>
            </Group>
            <Drawer
                opened={opened}
                onClose={close}
                title={
                    <Text c="white" fw={600}>
                        Menu
                    </Text>
                }
                position="right"
                closeButtonProps={{
                    'aria-label': 'Close navigation',
                    size: 44,
                }}
                size="min(calc(100vw - 24px), 360px)"
                classNames={{
                    content: classes.drawerContent,
                    body: classes.drawerBody,
                    header: classes.drawerHeader,
                }}
                portalProps={{ target: '#navbar-header' }}
            >
                <NavBarPortalContext.Provider
                    value={MOBILE_NAVIGATION_PORTAL_TARGET}
                >
                    <Box
                        id="navbar-navigation-content"
                        className={classes.mobileNavigation}
                        onClick={revealInlineNavMenuOnToggle}
                    >
                        {content}
                    </Box>
                </NavBarPortalContext.Provider>
            </Drawer>
        </>
    );
};
