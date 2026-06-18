import { Stack } from '@mantine/core';
import { Navigate, Outlet, type RouteObject } from 'react-router';
import AppRoute from './components/AppRoute';
import ProjectLayout from './components/common/ProjectLayout';
import ForbiddenPanel from './components/ForbiddenPanel';
import JobDetailsDrawer from './components/JobDetailsDrawer';
import NavBar from './components/NavBar';
import PrivateRoute from './components/PrivateRoute';
import ProjectRoute from './components/ProjectRoute';
import CreateProjectSettings from './components/Settings/CreateProjectSettings';
import UserCompletionModal from './components/UserCompletionModal';
import { MetricCatalogView } from './features/metricsCatalog/types';
import { TrackPage } from './providers/Tracking/TrackingProvider';
import { PageName } from './types/Events';

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
        path: '/register',
        lazy: async () => {
            const { default: Register } = await import('./pages/Register');
            return {
                Component: () => (
                    <TrackPage name={PageName.REGISTER}>
                        <Register />
                    </TrackPage>
                ),
            };
        },
    },
    {
        path: '/login',
        lazy: async () => {
            const { default: Login } = await import('./pages/Login');
            return {
                Component: () => (
                    <TrackPage name={PageName.LOGIN}>
                        <Login />
                    </TrackPage>
                ),
            };
        },
    },
    {
        path: '/recover-password',
        lazy: async () => {
            const { default: PasswordRecovery } =
                await import('./pages/PasswordRecovery');
            return {
                Component: () => (
                    <TrackPage name={PageName.PASSWORD_RECOVERY}>
                        <PasswordRecovery />
                    </TrackPage>
                ),
            };
        },
    },
    {
        path: '/reset-password/:code',
        lazy: async () => {
            const { default: PasswordReset } =
                await import('./pages/PasswordReset');
            return {
                Component: () => (
                    <TrackPage name={PageName.PASSWORD_RESET}>
                        <PasswordReset />
                    </TrackPage>
                ),
            };
        },
    },
    {
        path: '/invite/:inviteCode',
        lazy: async () => {
            const { default: Invite } = await import('./pages/Invite');
            return {
                Component: () => (
                    <TrackPage name={PageName.SIGNUP}>
                        <Invite />
                    </TrackPage>
                ),
            };
        },
    },
    {
        path: '/verify-email',
        lazy: async () => {
            const { default: VerifyEmailPage } =
                await import('./pages/VerifyEmail');
            return {
                Component: () => (
                    <TrackPage name={PageName.VERIFY_EMAIL}>
                        <VerifyEmailPage />
                    </TrackPage>
                ),
            };
        },
    },
    {
        path: '/join-organization',
        lazy: async () => {
            const { default: JoinOrganization } =
                await import('./pages/JoinOrganization');
            return {
                Component: () => (
                    <TrackPage name={PageName.JOIN_ORGANIZATION}>
                        <JoinOrganization />
                    </TrackPage>
                ),
            };
        },
    },
];

const MINIMAL_ROUTES: RouteObject[] = [
    {
        path: '/minimal',
        handle: { hideAILauncher: true },
        children: [
            {
                path: '/minimal/projects/:projectUuid/saved/:savedQueryUuid',
                lazy: async () => {
                    const { default: MinimalSavedExplorer } =
                        await import('./pages/MinimalSavedExplorer');
                    return {
                        Component: () => (
                            <Stack p="lg" h="100vh">
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
                            <Stack p="lg" h="100vh">
                                <MinimalSqlChart />
                            </Stack>
                        ),
                    };
                },
            },
            {
                path: '/minimal/projects/:projectUuid/apps/:appUuid',
                lazy: async () => {
                    const { default: MinimalApp } =
                        await import('./pages/MinimalApp');
                    return { Component: MinimalApp };
                },
            },
        ],
    },
];

const CHART_ROUTES: RouteObject[] = [
    {
        path: 'saved',
        lazy: async () => {
            const { default: SavedQueries } =
                await import('./pages/SavedQueries');
            return {
                Component: () => (
                    <TrackPage name={PageName.SAVED_QUERIES}>
                        <SavedQueries />
                    </TrackPage>
                ),
            };
        },
    },
    {
        path: 'saved/:savedQueryUuid',
        element: <Outlet />,
        children: [
            {
                path: 'history',
                lazy: async () => {
                    const { default: ChartHistory } =
                        await import('./pages/ChartHistory');
                    return {
                        Component: () => (
                            <TrackPage name={PageName.CHART_HISTORY}>
                                <ChartHistory />
                            </TrackPage>
                        ),
                    };
                },
            },
            {
                path: ':mode?',
                index: false,
                lazy: async () => {
                    const { default: SavedExplorer } =
                        await import('./pages/SavedExplorer');
                    return {
                        Component: () => (
                            <TrackPage name={PageName.SAVED_QUERY_EXPLORER}>
                                <SavedExplorer />
                            </TrackPage>
                        ),
                    };
                },
            },
        ],
    },
];

// Dashboard list route (uses ProjectLayout's fixed NavBar)
const DASHBOARD_LIST_ROUTES: RouteObject[] = [
    {
        path: 'dashboards',
        lazy: async () => {
            const { default: SavedDashboards } =
                await import('./pages/SavedDashboards');
            return {
                Component: () => (
                    <TrackPage name={PageName.SAVED_DASHBOARDS}>
                        <SavedDashboards />
                    </TrackPage>
                ),
            };
        },
    },
    {
        path: 'dashboards/:dashboardUuid/history',
        lazy: async () => {
            const { default: DashboardHistory } =
                await import('./pages/DashboardHistory');
            return {
                Component: () => (
                    <TrackPage name={PageName.DASHBOARD_HISTORY}>
                        <DashboardHistory />
                    </TrackPage>
                ),
            };
        },
    },
];

// Dashboard view routes (use handle.navBarFixed=false for non-fixed NavBar)
const DASHBOARD_VIEW_ROUTES: RouteObject[] = [
    {
        path: 'dashboards/:dashboardUuid',
        handle: { navBarFixed: false },
        children: [
            {
                path: ':mode?',
                index: false,
                lazy: async () => {
                    const { default: Dashboard } =
                        await import('./pages/Dashboard');
                    return {
                        Component: () => (
                            <TrackPage name={PageName.DASHBOARD}>
                                <Dashboard />
                            </TrackPage>
                        ),
                    };
                },
            },
            {
                path: ':mode/tabs/:tabUuid?',
                lazy: async () => {
                    const { default: Dashboard } =
                        await import('./pages/Dashboard');
                    return {
                        Component: () => (
                            <TrackPage name={PageName.DASHBOARD}>
                                <Dashboard />
                            </TrackPage>
                        ),
                    };
                },
            },
        ],
    },
];

const SQL_RUNNER_ROUTES: RouteObject[] = [
    {
        path: 'sql-runner',
        element: <Outlet />,
        children: [
            {
                index: true,
                lazy: async () => {
                    const { default: SqlRunner } =
                        await import('./pages/SqlRunner');
                    return { Component: SqlRunner };
                },
            },
            {
                path: ':slug',
                lazy: async () => {
                    const { default: ViewSqlChart } =
                        await import('./pages/ViewSqlChart');
                    return { Component: ViewSqlChart };
                },
            },
            {
                path: ':slug/edit',
                lazy: async () => {
                    const { default: SqlRunner } =
                        await import('./pages/SqlRunner');
                    return { Component: () => <SqlRunner isEditMode /> };
                },
            },
        ],
    },
];

const SOURCE_CODE_ROUTES: RouteObject[] = [
    {
        // Redirect old source-code route to project home with editor drawer open
        path: 'source-code',
        lazy: async () => {
            const { default: SourceCodeEditorRedirect } =
                await import('./pages/SourceCodeEditorRedirect');
            return { Component: SourceCodeEditorRedirect };
        },
    },
];

const TABLES_ROUTES: RouteObject[] = [
    {
        path: 'tables',
        lazy: async () => {
            const { default: Explorer } = await import('./pages/Explorer');
            return {
                Component: () => (
                    <TrackPage name={PageName.EXPLORE_TABLES}>
                        <Explorer />
                    </TrackPage>
                ),
            };
        },
    },
    {
        path: 'tables/:tableId',
        lazy: async () => {
            const { default: Explorer } = await import('./pages/Explorer');
            return {
                Component: () => (
                    <TrackPage name={PageName.EXPLORER}>
                        <Explorer />
                    </TrackPage>
                ),
            };
        },
    },
];

const SPACES_ROUTES: RouteObject[] = [
    {
        path: 'spaces',
        lazy: async () => {
            const { default: Spaces } = await import('./pages/Spaces');
            return {
                Component: () => (
                    <TrackPage name={PageName.SPACES}>
                        <Spaces />
                    </TrackPage>
                ),
            };
        },
    },
    {
        path: 'spaces/:spaceUuid',
        lazy: async () => {
            const { default: Space } = await import('./pages/Space');
            return {
                Component: () => (
                    <TrackPage name={PageName.SPACE}>
                        <Space />
                    </TrackPage>
                ),
            };
        },
    },
];

const METRICS_ROUTES: RouteObject[] = [
    {
        path: 'metrics',
        lazy: async () => {
            const { default: MetricsCatalog } =
                await import('./pages/MetricsCatalog');
            return {
                Component: () => (
                    <TrackPage name={PageName.METRICS_CATALOG}>
                        <MetricsCatalog />
                    </TrackPage>
                ),
            };
        },
    },
    {
        path: 'metrics/peek/:tableName/:metricName',
        lazy: async () => {
            const { default: MetricsCatalog } =
                await import('./pages/MetricsCatalog');
            return {
                Component: () => (
                    <TrackPage name={PageName.METRICS_CATALOG}>
                        <MetricsCatalog />
                    </TrackPage>
                ),
            };
        },
    },
    {
        path: 'metrics/canvas',
        lazy: async () => {
            const { default: MetricsCatalog } =
                await import('./pages/MetricsCatalog');
            return {
                Component: () => (
                    <TrackPage name={PageName.METRICS_CATALOG}>
                        <MetricsCatalog
                            metricCatalogView={MetricCatalogView.CANVAS}
                        />
                    </TrackPage>
                ),
            };
        },
    },
    {
        path: 'metrics/canvas/:treeSlug',
        lazy: async () => {
            const { default: MetricsCatalog } =
                await import('./pages/MetricsCatalog');
            return {
                Component: () => (
                    <TrackPage name={PageName.METRICS_CATALOG}>
                        <MetricsCatalog
                            metricCatalogView={MetricCatalogView.CANVAS}
                        />
                    </TrackPage>
                ),
            };
        },
    },
];

// Routes that use ProjectLayout (fixed NavBar + SourceCodeDrawer)
const PROJECT_LAYOUT_ROUTES: RouteObject[] = [
    ...TABLES_ROUTES,
    ...SQL_RUNNER_ROUTES,
    ...SOURCE_CODE_ROUTES,
    ...CHART_ROUTES,
    ...DASHBOARD_LIST_ROUTES,
    ...SPACES_ROUTES,
    ...METRICS_ROUTES,
    {
        path: 'home',
        lazy: async () => {
            const { default: Home } = await import('./pages/Home');
            return {
                Component: () => (
                    <TrackPage name={PageName.HOME}>
                        <Home />
                    </TrackPage>
                ),
            };
        },
    },
    {
        path: 'autopilot',
        lazy: async () => {
            const { ManagedAgentActivityPage } =
                await import('./ee/features/managedAgent/ManagedAgentActivityPage');
            return { Component: ManagedAgentActivityPage };
        },
    },
    {
        path: 'improve',
        element: <Navigate to="../autopilot" replace />,
    },
    {
        path: 'apps/generate',
        handle: { hideAILauncher: true },
        lazy: async () => {
            const { default: AppGenerate } =
                await import('./pages/AppGenerate');
            return { Component: AppGenerate };
        },
    },
    {
        path: 'apps/:appUuid',
        handle: { hideAILauncher: true },
        lazy: async () => {
            const { default: AppGenerate } =
                await import('./pages/AppGenerate');
            return { Component: AppGenerate };
        },
    },
    {
        path: 'apps/:appUuid/versions/:version/preview',
        handle: { hideAILauncher: true },
        lazy: async () => {
            const { default: AppPreviewTest } =
                await import('./pages/AppPreviewTest');
            return { Component: AppPreviewTest };
        },
    },
    {
        path: 'apps/:appUuid/preview',
        handle: { hideAILauncher: true },
        lazy: async () => {
            const { default: AppPreviewTest } =
                await import('./pages/AppPreviewTest');
            return { Component: AppPreviewTest };
        },
    },
    {
        path: 'user-activity',
        lazy: async () => {
            const { default: UserActivity } =
                await import('./pages/UserActivity');
            return {
                Component: () => (
                    <TrackPage name={PageName.USER_ACTIVITY}>
                        <UserActivity />
                    </TrackPage>
                ),
            };
        },
    },
    {
        path: 'funnel-builder',
        handle: { hideAILauncher: true },
        lazy: async () => {
            const { default: FunnelBuilder } =
                await import('./features/funnelBuilder/FunnelBuilderPage');
            return {
                Component: () => (
                    <TrackPage name={PageName.FUNNEL_BUILDER}>
                        <FunnelBuilder />
                    </TrackPage>
                ),
            };
        },
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
                    // Legacy sqlRunner redirect (no layout needed)
                    {
                        path: 'sqlRunner',
                        lazy: async () => {
                            const { default: LegacySqlRunner } =
                                await import('./pages/LegacySqlRunner');
                            return { Component: LegacySqlRunner };
                        },
                    },
                    // All project routes share ProjectLayout (NavBar + SourceCodeDrawer)
                    {
                        element: <ProjectLayout />,
                        children: [
                            ...PROJECT_LAYOUT_ROUTES,
                            ...DASHBOARD_VIEW_ROUTES,
                        ],
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
                <UserCompletionModal />
                <JobDetailsDrawer />
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
                path: '/createProject/:method?',
                lazy: async () => {
                    const { default: CreateProject } =
                        await import('./pages/CreateProject');
                    return {
                        Component: () => (
                            <>
                                <NavBar />
                                <TrackPage name={PageName.CREATE_PROJECT}>
                                    <CreateProject />
                                </TrackPage>
                            </>
                        ),
                    };
                },
            },
            {
                path: '/createProjectSettings/:projectUuid',
                handle: { hideAILauncher: true },
                element: (
                    <>
                        <NavBar />
                        <TrackPage name={PageName.CREATE_PROJECT_SETTINGS}>
                            <CreateProjectSettings />
                        </TrackPage>
                    </>
                ),
            },
            {
                path: '/generalSettings/*',
                handle: { hideAILauncher: true },
                lazy: async () => {
                    const { default: Settings } =
                        await import('./pages/Settings');
                    return {
                        Component: () => (
                            <>
                                <NavBar />
                                <TrackPage name={PageName.GENERAL_SETTINGS}>
                                    <Settings />
                                </TrackPage>
                            </>
                        ),
                    };
                },
            },
            {
                path: '/no-access',
                handle: { hideAILauncher: true },
                element: (
                    <>
                        <NavBar />
                        <TrackPage name={PageName.NO_ACCESS}>
                            <ForbiddenPanel />
                        </TrackPage>
                    </>
                ),
            },
            {
                path: '/no-project-access',
                handle: { hideAILauncher: true },
                element: (
                    <>
                        <NavBar />
                        <TrackPage name={PageName.NO_PROJECT_ACCESS}>
                            <ForbiddenPanel subject="project" />
                        </TrackPage>
                    </>
                ),
            },
            {
                path: '/share/:shareNanoid',
                handle: { hideAILauncher: true },
                lazy: async () => {
                    const { default: ShareRedirect } =
                        await import('./pages/ShareRedirect');
                    return {
                        Component: () => (
                            <>
                                <NavBar />
                                <TrackPage name={PageName.SHARE}>
                                    <ShareRedirect />
                                </TrackPage>
                            </>
                        ),
                    };
                },
            },
        ],
    },
];

const WebAppRoutes = [...PUBLIC_ROUTES, ...PRIVATE_ROUTES, FALLBACK_ROUTE];
export default WebAppRoutes;
