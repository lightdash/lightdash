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
import { lazy, Suspense, useCallback, useMemo, useState, type FC } from 'react';
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
import { ThemeSwitcher } from './components/NavBar/ThemeSwitcher';
import PrivateRoute from './components/PrivateRoute';
import ProjectRoute from './components/ProjectRoute';
import { useActiveProjectUuid } from './hooks/useActiveProject';
import useLogoutMutation from './hooks/user/useUserLogoutMutation';
import { getMantineThemeOverride } from './mantineTheme';
import { TrackPage } from './providers/Tracking/TrackingProvider';
import Logo from './svgs/logo-icon.svg?react';
import { PageName } from './types/Events';

const MobileAiAgentsNavLink = lazy(
    () => import('./components/Mobile/MobileAiAgentsNavLink'),
);

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

export const MobileNavBar: FC = () => {
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
            window.location.href = '/login';
        },
    });

    // Force dark theme for navbar (excluding global styles)
    const darkTheme = useMemo(() => {
        const fullDarkTheme = getMantineThemeOverride('dark');
        const { globalStyles, ...themeWithoutGlobalStyles } = fullDarkTheme;
        return themeWithoutGlobalStyles;
    }, []);

    return (
        <MantineProvider theme={darkTheme}>
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

            <Drawer
                title={<ThemeSwitcher />}
                opened={isMenuOpen}
                onClose={toggleMenu}
                size="75%"
            >
                <Title order={6} fw={600} mb="xs">
                    Project
                </Title>
                <ProjectSwitcher />
                <Divider my="lg" />
                <RouterNavLink
                    exact
                    label="Home"
                    to={`/`}
                    leftSection={<MantineIcon icon={IconHome} />}
                    onClick={toggleMenu}
                />
                <RouterNavLink
                    exact
                    label="Spaces"
                    to={`/projects/${activeProjectUuid}/spaces`}
                    leftSection={<MantineIcon icon={IconFolders} />}
                    onClick={toggleMenu}
                />
                <RouterNavLink
                    exact
                    label="Dashboards"
                    to={`/projects/${activeProjectUuid}/dashboards`}
                    leftSection={<MantineIcon icon={IconLayoutDashboard} />}
                    onClick={toggleMenu}
                />
                <RouterNavLink
                    exact
                    label="Charts"
                    to={`/projects/${activeProjectUuid}/saved`}
                    leftSection={<MantineIcon icon={IconChartAreaLine} />}
                    onClick={toggleMenu}
                />
                {isMenuOpen && (
                    <Suspense fallback={null}>
                        <MobileAiAgentsNavLink
                            activeProjectUuid={activeProjectUuid}
                            onClick={toggleMenu}
                        />
                    </Suspense>
                )}
                <Divider my="lg" />

                <RouterNavLink
                    exact
                    label="Logout"
                    to={`/`}
                    leftSection={<MantineIcon icon={IconLogout} />}
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
    '/projects/:projectUuid/apps/:appUuid',
    '/projects/:projectUuid/apps/generate',
];

const FALLBACK_ROUTE: RouteObject = {
    path: '*',
    element: <Navigate to="/projects" />,
};

const PUBLIC_ROUTES: RouteObject[] = [
    {
        path: '/auth/popup/:status',
        lazy: async () => {
            const { default: AuthPopupResult } =
                await import('./pages/AuthPopupResult');
            return { Component: AuthPopupResult };
        },
    },
    {
        path: '/login',
        lazy: async () => {
            const { default: Login } = await import('./pages/Login');
            return {
                Component: () => (
                    <TrackPage name={PageName.LOGIN}>
                        <Login minimal={true} />
                    </TrackPage>
                ),
            };
        },
    },
    {
        path: '/no-mobile-page',
        element: <MobileView />,
    },
    {
        // Autoclose popup after github installation
        path: '/generalSettings/integrations',
        lazy: async () => {
            const { default: SuccessAuthPopupResult } =
                await import('./pages/SuccessAuthPopupResult');
            return { Component: SuccessAuthPopupResult };
        },
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
                lazy: async () => {
                    const { default: MinimalSavedExplorer } =
                        await import('./pages/MinimalSavedExplorer');
                    return {
                        Component: () => (
                            <Stack p="lg" h="90vh">
                                <MinimalSavedExplorer />
                            </Stack>
                        ),
                    };
                },
            },
            {
                path: '/minimal/projects/:projectUuid/dashboards/:dashboardUuid',
                lazy: async () => {
                    const { default: MinimalDashboard } =
                        await import('./pages/MinimalDashboard');
                    return { Component: MinimalDashboard };
                },
            },
            {
                path: '/minimal/projects/:projectUuid/dashboards/:dashboardUuid/view/tabs/:tabUuid',
                lazy: async () => {
                    const { default: MinimalDashboard } =
                        await import('./pages/MinimalDashboard');
                    return { Component: MinimalDashboard };
                },
            },
            {
                path: '/minimal/projects/:projectUuid/sql-runner/:savedSqlUuid',
                lazy: async () => {
                    const { default: MinimalSqlChart } =
                        await import('./pages/MinimalSqlChart');
                    return {
                        Component: () => (
                            <Stack p="lg" h="90vh">
                                <MinimalSqlChart />
                            </Stack>
                        ),
                    };
                },
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
                lazy: async () => {
                    const { default: Projects } =
                        await import('./pages/Projects');
                    return { Component: Projects };
                },
            },
            {
                path: '/projects/:projectUuid',
                element: (
                    <ProjectRoute>
                        <Outlet />
                    </ProjectRoute>
                ),
                children: [
                    { index: true, element: <Navigate to="home" replace /> },
                    {
                        path: '/projects/:projectUuid/home',
                        lazy: async () => {
                            const { default: MobileHome } =
                                await import('./pages/MobileHome');
                            return {
                                Component: () => (
                                    <TrackPage name={PageName.HOME}>
                                        <MobileHome />
                                    </TrackPage>
                                ),
                            };
                        },
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
                        lazy: async () => {
                            const { default: MobileCharts } =
                                await import('./pages/MobileCharts');
                            return {
                                Component: () => (
                                    <TrackPage name={PageName.SAVED_QUERIES}>
                                        <MobileCharts />
                                    </TrackPage>
                                ),
                            };
                        },
                    },
                    {
                        path: '/projects/:projectUuid/dashboards',
                        lazy: async () => {
                            const { default: MobileDashboards } =
                                await import('./pages/MobileDashboards');
                            return {
                                Component: () => (
                                    <TrackPage name={PageName.SAVED_DASHBOARDS}>
                                        <MobileDashboards />
                                    </TrackPage>
                                ),
                            };
                        },
                    },
                    {
                        path: '/projects/:projectUuid/spaces/:spaceUuid',
                        lazy: async () => {
                            const { default: MobileSpace } =
                                await import('./pages/MobileSpace');
                            return {
                                Component: () => (
                                    <TrackPage name={PageName.SPACE}>
                                        <MobileSpace />
                                    </TrackPage>
                                ),
                            };
                        },
                    },
                    {
                        path: '/projects/:projectUuid/spaces',
                        lazy: async () => {
                            const { default: MobileSpaces } =
                                await import('./pages/MobileSpaces');
                            return {
                                Component: () => (
                                    <TrackPage name={PageName.SPACES}>
                                        <MobileSpaces />
                                    </TrackPage>
                                ),
                            };
                        },
                    },
                    {
                        path: '/projects/:projectUuid/apps/:appUuid/preview',
                        lazy: async () => {
                            const { default: AppPreviewTest } =
                                await import('./pages/AppPreviewTest');
                            return { Component: AppPreviewTest };
                        },
                    },
                    {
                        path: '/projects/:projectUuid/apps/:appUuid/versions/:version/preview',
                        lazy: async () => {
                            const { default: AppPreviewTest } =
                                await import('./pages/AppPreviewTest');
                            return { Component: AppPreviewTest };
                        },
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
                lazy: async () => {
                    const { default: ShareRedirect } =
                        await import('./pages/ShareRedirect');
                    return {
                        Component: () => (
                            <TrackPage name={PageName.SHARE}>
                                <ShareRedirect />
                            </TrackPage>
                        ),
                    };
                },
            },
        ],
    },
];

const MobileRoutes = [...PUBLIC_ROUTES, ...PRIVATE_ROUTES, FALLBACK_ROUTE];

export default MobileRoutes;
