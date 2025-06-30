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
import {
    Link,
    Navigate,
    Outlet,
    useParams,
    type RouteObject,
} from 'react-router';
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
import AuthPopupResult, {
    SuccessAuthPopupResult,
} from './pages/AuthPopupResult';
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
import { TrackPage } from './providers/Tracking/TrackingProvider';
import Logo from './svgs/logo-icon.svg?react';
import { PageName } from './types/Events';

const RedirectToResource: FC = () => {
    const { projectUuid, savedQueryUuid, dashboardUuid } = useParams();
    if (dashboardUuid) {
        return (
            <Navigate
                to={`/minimal/projects/${projectUuid}/dashboards/${dashboardUuid}`}
                replace
            />
        );
    }
    if (savedQueryUuid) {
        return (
            <Navigate
                to={`/minimal/projects/${projectUuid}/saved/${savedQueryUuid}`}
                replace
            />
        );
    }
    return <Navigate to="/no-mobile-page" />;
};

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
    '/projects/:projectUuid/sql-runner',
    '/projects/:projectUuid/tables/:tableId',
    '/projects/:projectUuid/tables',
    '/projects/:projectUuid/user-activity',
];

const FALLBACK_ROUTE: RouteObject = {
    path: '*',
    element: <Navigate to="/projects" />,
};

const PUBLIC_ROUTES: RouteObject[] = [
    {
        path: '/auth/popup/:status',
        element: <AuthPopupResult />,
    },
    {
        path: '/login',
        element: (
            <TrackPage name={PageName.LOGIN}>
                <Login minimal={true} />
            </TrackPage>
        ),
    },
    {
        path: '/no-mobile-page',
        element: <MobileView />,
    },
    {
        // Autoclose popup after github installation
        path: '/generalSettings/integrations',
        element: <SuccessAuthPopupResult />,
    },
    ...routesNotSupportedInMobile.map((route) => ({
        path: route,
        element: <Navigate to="/no-mobile-page" />,
    })),
];

const MINIMAL_ROUTES: RouteObject[] = [
    {
        path: '/minimal',
        children: [
            {
                path: '/minimal/projects/:projectUuid/saved/:savedQueryUuid',
                element: (
                    <Stack p="lg" h="90vh">
                        <MinimalSavedExplorer />
                    </Stack>
                ),
            },
            {
                path: '/minimal/projects/:projectUuid/dashboards/:dashboardUuid',
                element: <MinimalDashboard />,
            },
            {
                path: '/minimal/projects/:projectUuid/dashboards/:dashboardUuid/view/tabs/:tabUuid',
                element: <MinimalDashboard />,
            },
        ],
    },
];

const APP_ROUTES: RouteObject[] = [
    {
        path: '/projects',
        element: (
            <AppRoute>
                <Outlet />
            </AppRoute>
        ),
        children: [
            {
                path: '/projects',
                element: <Projects />,
            },
            {
                path: '/projects/:projectUuid',
                element: (
                    <ProjectRoute>
                        <Outlet />
                    </ProjectRoute>
                ),
                children: [
                    {
                        path: '/projects/:projectUuid/home',
                        element: (
                            <TrackPage name={PageName.HOME}>
                                <MobileHome />
                            </TrackPage>
                        ),
                    },
                    {
                        path: '/projects/:projectUuid/saved/:savedQueryUuid/:mode?',
                        element: <RedirectToResource />,
                    },
                    {
                        path: '/projects/:projectUuid/dashboards/:dashboardUuid/:mode?',
                        element: <RedirectToResource />,
                    },
                    {
                        path: '/projects/:projectUuid/saved',
                        element: (
                            <TrackPage name={PageName.SAVED_QUERIES}>
                                <MobileCharts />
                            </TrackPage>
                        ),
                    },
                    {
                        path: '/projects/:projectUuid/dashboards',
                        element: (
                            <TrackPage name={PageName.SAVED_DASHBOARDS}>
                                <MobileDashboards />
                            </TrackPage>
                        ),
                    },
                    {
                        path: '/projects/:projectUuid/spaces/:spaceUuid',
                        element: (
                            <TrackPage name={PageName.SPACE}>
                                <MobileSpace />
                            </TrackPage>
                        ),
                    },
                    {
                        path: '/projects/:projectUuid/spaces',
                        element: (
                            <TrackPage name={PageName.SPACES}>
                                <MobileSpaces />
                            </TrackPage>
                        ),
                    },
                ],
            },
        ],
    },
];

const PRIVATE_ROUTES: RouteObject[] = [
    {
        path: '/',
        element: (
            <PrivateRoute>
                <MobileNavBar />
                <Outlet />
            </PrivateRoute>
        ),
        children: [
            ...MINIMAL_ROUTES,
            ...APP_ROUTES,
            {
                path: '/',
                element: <Navigate to="/projects" replace />,
            },
            {
                path: '/no-access',
                element: (
                    <TrackPage name={PageName.NO_ACCESS}>
                        <ForbiddenPanel />
                    </TrackPage>
                ),
            },
            {
                path: '/no-access',
                element: (
                    <TrackPage name={PageName.NO_ACCESS}>
                        <ForbiddenPanel />
                    </TrackPage>
                ),
            },
            {
                path: '/no-project-access',
                element: (
                    <TrackPage name={PageName.NO_PROJECT_ACCESS}>
                        <ForbiddenPanel subject="project" />
                    </TrackPage>
                ),
            },
            {
                path: '/share/:shareNanoid',
                element: (
                    <TrackPage name={PageName.SHARE}>
                        <ShareRedirect />
                    </TrackPage>
                ),
            },
        ],
    },
];

const MobileRoutes = [...PUBLIC_ROUTES, ...PRIVATE_ROUTES, FALLBACK_ROUTE];

export default MobileRoutes;
