import {
    ActionIcon,
    Burger,
    Divider,
    Drawer,
    getDefaultZIndex,
    Group,
    Header,
    MantineProvider,
    Stack,
    Title,
} from '@mantine/core';
import {
    IconChartAreaLine,
    IconFolders,
    IconHome,
    IconLayoutDashboard,
    IconLogout,
} from '@tabler/icons-react';
import posthog from 'posthog-js';
import React, { useCallback, useState, type FC } from 'react';
import { Link, Redirect, Route, Switch } from 'react-router-dom';
import AppRoute from './components/AppRoute';
import MantineIcon from './components/common/MantineIcon';
import RouterNavLink from './components/common/RouterNavLink';
import ForbiddenPanel from './components/ForbiddenPanel';
import MobileView from './components/Mobile';
import ProjectSwitcher from './components/NavBar/ProjectSwitcher';
import PrivateRoute from './components/PrivateRoute';
import ProjectRoute from './components/ProjectRoute';
import { useActiveProjectUuid } from './hooks/useActiveProject';
import useLogoutMutation from './hooks/user/useUserLogoutMutation';
import AuthPopupResult from './pages/AuthPopupResult';
import Login from './pages/Login';
import MinimalDashboard from './pages/MinimalDashboard';
import MinimalSavedExplorer from './pages/MinimalSavedExplorer';
import MobileCharts from './pages/MobileCharts';
import MobileDashboards from './pages/MobileDashboards';
import MobileHome from './pages/MobileHome';
import MobileSpace from './pages/MobileSpace';
import MobileSpaces from './pages/MobileSpaces';
import Projects from './pages/Projects';
import ShareRedirect from './pages/ShareRedirect';
import { TrackPage } from './providers/TrackingProvider';
import Logo from './svgs/logo-icon.svg?react';
import { PageName } from './types/Events';

const MobileNavBar: FC = () => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const toggleMenu = useCallback(
        () => setIsMenuOpen((prevValue) => !prevValue),
        [],
    );
    const { activeProjectUuid } = useActiveProjectUuid({
        refetchOnMount: true,
    });
    const { mutate: logout } = useLogoutMutation({
        onSuccess: () => {
            posthog.reset();
            window.location.href = '/login';
        },
    });

    return (
        <MantineProvider inherit theme={{ colorScheme: 'dark' }}>
            <Header
                height={50}
                display="flex"
                px="md"
                zIndex={getDefaultZIndex('app')}
                sx={{
                    alignItems: 'center',
                    boxShadow: 'lg',
                }}
            >
                <Group align="center" position="apart" sx={{ flex: 1 }}>
                    <ActionIcon
                        component={Link}
                        to={'/'}
                        title="Home"
                        size="lg"
                    >
                        <Logo />
                    </ActionIcon>
                    <Burger opened={isMenuOpen} onClick={toggleMenu} />
                </Group>
            </Header>

            <Drawer opened={isMenuOpen} onClose={toggleMenu} size="75%">
                <Title order={6} fw={600} mb="xs">
                    Project
                </Title>
                <ProjectSwitcher />
                <Divider my="lg" />
                <RouterNavLink
                    exact
                    label="Home"
                    to={`/`}
                    icon={<MantineIcon icon={IconHome} />}
                    onClick={toggleMenu}
                />
                <RouterNavLink
                    exact
                    label="Spaces"
                    to={`/projects/${activeProjectUuid}/spaces`}
                    icon={<MantineIcon icon={IconFolders} />}
                    onClick={toggleMenu}
                />
                <RouterNavLink
                    exact
                    label="Dashboards"
                    to={`/projects/${activeProjectUuid}/dashboards`}
                    icon={<MantineIcon icon={IconLayoutDashboard} />}
                    onClick={toggleMenu}
                />
                <RouterNavLink
                    exact
                    label="Charts"
                    to={`/projects/${activeProjectUuid}/saved`}
                    icon={<MantineIcon icon={IconChartAreaLine} />}
                    onClick={toggleMenu}
                />
                <Divider my="lg" />
                <RouterNavLink
                    exact
                    label="Logout"
                    to={`/`}
                    icon={<MantineIcon icon={IconLogout} />}
                    onClick={() => logout()}
                />
            </Drawer>
        </MantineProvider>
    );
};

const routesNotSupportedInMobile = [
    '/register',
    '/recover-password',
    '/reset-password/:code',
    '/invite/:inviteCode',
    '/verify-email',
    '/join-organization',
    '/createProject/:method?',
    '/createProjectSettings/:projectUuid',
    '/generalSettings/:tab?',
    '/projects/:projectUuid/saved/:savedQueryUuid/history',
    '/projects/:projectUuid/sqlRunner',
    '/projects/:projectUuid/dbtsemanticlayer',
    '/projects/:projectUuid/tables/:tableId',
    '/projects/:projectUuid/tables',
    '/projects/:projectUuid/user-activity',
];

const MobileRoutes: FC = () => {
    return (
        <Switch>
            <Route path="/auth/popup/:status">
                <AuthPopupResult />
            </Route>
            <Route path="/login">
                <TrackPage name={PageName.LOGIN}>
                    <Login minimal={true} />
                </TrackPage>
            </Route>
            <Route path="/no-mobile-page">
                <MobileView />
            </Route>
            {routesNotSupportedInMobile.map((route) => (
                <Redirect key={route} from={route} to="/no-mobile-page" />
            ))}
            <PrivateRoute path="/">
                <MobileNavBar />
                <Switch>
                    <Route path="/no-access">
                        <TrackPage name={PageName.NO_ACCESS}>
                            <ForbiddenPanel />
                        </TrackPage>
                    </Route>
                    <Route path="/no-project-access">
                        <TrackPage name={PageName.NO_PROJECT_ACCESS}>
                            <ForbiddenPanel subject="project" />
                        </TrackPage>
                    </Route>
                    <Route path="/share/:shareNanoid">
                        <TrackPage name={PageName.SHARE}>
                            <ShareRedirect />
                        </TrackPage>
                    </Route>
                    <AppRoute path="/">
                        <Switch>
                            <PrivateRoute path="/minimal">
                                <Switch>
                                    <Route path="/minimal/projects/:projectUuid/saved/:savedQueryUuid">
                                        <Stack p="lg" h="90vh">
                                            <MinimalSavedExplorer />
                                        </Stack>
                                    </Route>

                                    <Route path="/minimal/projects/:projectUuid/dashboards/:dashboardUuid">
                                        <MinimalDashboard />
                                    </Route>
                                </Switch>
                            </PrivateRoute>
                            <ProjectRoute path="/projects/:projectUuid">
                                <Switch>
                                    <Redirect
                                        from="/projects/:projectUuid/saved/:savedQueryUuid/:mode?"
                                        to="/minimal/projects/:projectUuid/saved/:savedQueryUuid"
                                    />
                                    <Redirect
                                        from="/projects/:projectUuid/dashboards/:dashboardUuid/:mode?"
                                        to="/minimal/projects/:projectUuid/dashboards/:dashboardUuid"
                                    />

                                    <Route path="/projects/:projectUuid/saved">
                                        <TrackPage
                                            name={PageName.SAVED_QUERIES}
                                        >
                                            <MobileCharts />
                                        </TrackPage>
                                    </Route>

                                    <Route path="/projects/:projectUuid/dashboards">
                                        <TrackPage
                                            name={PageName.SAVED_DASHBOARDS}
                                        >
                                            <MobileDashboards />
                                        </TrackPage>
                                    </Route>

                                    <Route path="/projects/:projectUuid/spaces/:spaceUuid">
                                        <TrackPage name={PageName.SPACE}>
                                            <MobileSpace />
                                        </TrackPage>
                                    </Route>

                                    <Route path="/projects/:projectUuid/spaces">
                                        <TrackPage name={PageName.SPACES}>
                                            <MobileSpaces />
                                        </TrackPage>
                                    </Route>

                                    <Route
                                        path="/projects/:projectUuid/home"
                                        exact
                                    >
                                        <TrackPage name={PageName.HOME}>
                                            <MobileHome />
                                        </TrackPage>
                                    </Route>

                                    <Redirect to="/projects" />
                                </Switch>
                            </ProjectRoute>

                            <Route path="/projects/:projectUuid?" exact>
                                <Projects />
                            </Route>

                            <Redirect to="/projects" />
                        </Switch>
                    </AppRoute>
                </Switch>
            </PrivateRoute>
        </Switch>
    );
};

export default MobileRoutes;
