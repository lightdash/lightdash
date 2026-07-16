import { Stack } from '@mantine-8/core';
import { type FC } from 'react';
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
import { loadLazyRouteDefault } from './features/chunkErrorHandler';
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
            const AuthPopupResult = await loadLazyRouteDefault(
                './pages/AuthPopupResult',
                () => import('./pages/AuthPopupResult'),
            );
            return { Component: AuthPopupResult };
        },
    },
    {
        path: '/register',
        lazy: async () => {
            const Register = await loadLazyRouteDefault(
                './pages/Register',
                () => import('./pages/Register'),
            );
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
            const Login = await loadLazyRouteDefault(
                './pages/Login',
                () => import('./pages/Login'),
            );
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
            const PasswordRecovery = await loadLazyRouteDefault(
                './pages/PasswordRecovery',
                () => import('./pages/PasswordRecovery'),
            );
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
            const PasswordReset = await loadLazyRouteDefault(
                './pages/PasswordReset',
                () => import('./pages/PasswordReset'),
            );
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
            const Invite = await loadLazyRouteDefault(
                './pages/Invite',
                () => import('./pages/Invite'),
            );
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
            const VerifyEmailPage = await loadLazyRouteDefault(
                './pages/VerifyEmail',
                () => import('./pages/VerifyEmail'),
            );
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
            const JoinOrganization = await loadLazyRouteDefault(
                './pages/JoinOrganization',
                () => import('./pages/JoinOrganization'),
            );
            return {
                Component: () => (
                    <TrackPage name={PageName.JOIN_ORGANIZATION}>
                        <JoinOrganization />
                    </TrackPage>
                ),
            };
        },
    },
    {
        path: '/organization-setup',
        lazy: async () => {
            const OrganizationSetup = await loadLazyRouteDefault(
                './pages/OrganizationSetup',
                () => import('./pages/OrganizationSetup'),
            );
            return {
                Component: () => (
                    <TrackPage name={PageName.ORGANIZATION_SETUP}>
                        <OrganizationSetup />
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
                    const MinimalSavedExplorer = await loadLazyRouteDefault(
                        './pages/MinimalSavedExplorer',
                        () => import('./pages/MinimalSavedExplorer'),
                    );
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
                    const MinimalDashboard = await loadLazyRouteDefault(
                        './pages/MinimalDashboard',
                        () => import('./pages/MinimalDashboard'),
                    );
                    return { Component: MinimalDashboard };
                },
            },
            {
                path: '/minimal/projects/:projectUuid/dashboards/:dashboardUuid/view/tabs/:tabUuid',
                lazy: async () => {
                    const MinimalDashboard = await loadLazyRouteDefault(
                        './pages/MinimalDashboard',
                        () => import('./pages/MinimalDashboard'),
                    );
                    return { Component: MinimalDashboard };
                },
            },
            {
                path: '/minimal/projects/:projectUuid/sql-runner/:savedSqlUuid',
                lazy: async () => {
                    const MinimalSqlChart = await loadLazyRouteDefault(
                        './pages/MinimalSqlChart',
                        () => import('./pages/MinimalSqlChart'),
                    );
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
                    const MinimalApp = await loadLazyRouteDefault(
                        './pages/MinimalApp',
                        () => import('./pages/MinimalApp'),
                    );
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
            const SavedQueries = await loadLazyRouteDefault(
                './pages/SavedQueries',
                () => import('./pages/SavedQueries'),
            );
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
                    const ChartHistory = await loadLazyRouteDefault(
                        './pages/ChartHistory',
                        () => import('./pages/ChartHistory'),
                    );
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
                    const SavedExplorer = await loadLazyRouteDefault(
                        './pages/SavedExplorer',
                        () => import('./pages/SavedExplorer'),
                    );
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
            const SavedDashboards = await loadLazyRouteDefault(
                './pages/SavedDashboards',
                () => import('./pages/SavedDashboards'),
            );
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
            const DashboardHistory = await loadLazyRouteDefault(
                './pages/DashboardHistory',
                () => import('./pages/DashboardHistory'),
            );
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
// Both dashboard routes (`:mode?` and `:mode/tabs/:tabUuid?`) must resolve to the
// SAME Component identity. Otherwise navigating between them (e.g. adding the first
// tab navigates `/edit` -> `/edit/tabs/:uuid`) swaps the component type at the Outlet
// and React remounts DashboardProvider, discarding unsaved tabs.
let DashboardRouteComponent: FC | undefined;
const loadDashboardRoute = async () => {
    if (!DashboardRouteComponent) {
        const Dashboard = await loadLazyRouteDefault(
            './pages/Dashboard',
            () => import('./pages/Dashboard'),
        );
        DashboardRouteComponent = () => (
            <TrackPage name={PageName.DASHBOARD}>
                <Dashboard />
            </TrackPage>
        );
    }
    return { Component: DashboardRouteComponent };
};

const DASHBOARD_VIEW_ROUTES: RouteObject[] = [
    {
        path: 'dashboards/:dashboardUuid',
        handle: { navBarFixed: false },
        children: [
            {
                path: ':mode?',
                index: false,
                lazy: loadDashboardRoute,
            },
            {
                path: ':mode/tabs/:tabUuid?',
                lazy: loadDashboardRoute,
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
                    const SqlRunner = await loadLazyRouteDefault(
                        './pages/SqlRunner',
                        () => import('./pages/SqlRunner'),
                    );
                    return { Component: SqlRunner };
                },
            },
            {
                path: ':slug',
                lazy: async () => {
                    const ViewSqlChart = await loadLazyRouteDefault(
                        './pages/ViewSqlChart',
                        () => import('./pages/ViewSqlChart'),
                    );
                    return { Component: ViewSqlChart };
                },
            },
            {
                path: ':slug/edit',
                lazy: async () => {
                    const SqlRunner = await loadLazyRouteDefault(
                        './pages/SqlRunner',
                        () => import('./pages/SqlRunner'),
                    );
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
            const SourceCodeEditorRedirect = await loadLazyRouteDefault(
                './pages/SourceCodeEditorRedirect',
                () => import('./pages/SourceCodeEditorRedirect'),
            );
            return { Component: SourceCodeEditorRedirect };
        },
    },
];

const TABLES_ROUTES: RouteObject[] = [
    {
        path: 'tables',
        lazy: async () => {
            const Explorer = await loadLazyRouteDefault(
                './pages/Explorer',
                () => import('./pages/Explorer'),
            );
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
            const Explorer = await loadLazyRouteDefault(
                './pages/Explorer',
                () => import('./pages/Explorer'),
            );
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
            const Spaces = await loadLazyRouteDefault(
                './pages/Spaces',
                () => import('./pages/Spaces'),
            );
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
            const Space = await loadLazyRouteDefault(
                './pages/Space',
                () => import('./pages/Space'),
            );
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
            const MetricsCatalog = await loadLazyRouteDefault(
                './pages/MetricsCatalog',
                () => import('./pages/MetricsCatalog'),
            );
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
            const MetricsCatalog = await loadLazyRouteDefault(
                './pages/MetricsCatalog',
                () => import('./pages/MetricsCatalog'),
            );
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
            const MetricsCatalog = await loadLazyRouteDefault(
                './pages/MetricsCatalog',
                () => import('./pages/MetricsCatalog'),
            );
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
            const MetricsCatalog = await loadLazyRouteDefault(
                './pages/MetricsCatalog',
                () => import('./pages/MetricsCatalog'),
            );
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
            const Home = await loadLazyRouteDefault(
                './pages/Home',
                () => import('./pages/Home'),
            );
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
        path: 'homepage-builder',
        lazy: async () => {
            const { HomepageBuilderPage } =
                await import('./ee/features/homepageBuilder/HomepageBuilderPage');
            return { Component: HomepageBuilderPage };
        },
    },
    {
        path: 'improve',
        element: <Navigate to="../autopilot" replace />,
    },
    {
        path: 'apps',
        lazy: async () => {
            const SavedApps = await loadLazyRouteDefault(
                './pages/SavedApps',
                () => import('./pages/SavedApps'),
            );
            return { Component: SavedApps };
        },
    },
    {
        path: 'apps/generate',
        handle: { hideAILauncher: true },
        lazy: async () => {
            const AppGenerate = await loadLazyRouteDefault(
                './pages/AppGenerate',
                () => import('./pages/AppGenerate'),
            );
            return { Component: AppGenerate };
        },
    },
    {
        path: 'apps/:appUuid',
        handle: { hideAILauncher: true },
        lazy: async () => {
            const AppGenerate = await loadLazyRouteDefault(
                './pages/AppGenerate',
                () => import('./pages/AppGenerate'),
            );
            return { Component: AppGenerate };
        },
    },
    {
        path: 'apps/:appUuid/versions/:version/preview',
        handle: { hideAILauncher: true },
        lazy: async () => {
            const AppPreviewTest = await loadLazyRouteDefault(
                './pages/AppPreviewTest',
                () => import('./pages/AppPreviewTest'),
            );
            return { Component: AppPreviewTest };
        },
    },
    {
        path: 'apps/:appUuid/preview',
        handle: { hideAILauncher: true },
        lazy: async () => {
            const AppPreviewTest = await loadLazyRouteDefault(
                './pages/AppPreviewTest',
                () => import('./pages/AppPreviewTest'),
            );
            return { Component: AppPreviewTest };
        },
    },
    {
        path: 'user-activity',
        lazy: async () => {
            const UserActivity = await loadLazyRouteDefault(
                './pages/UserActivity',
                () => import('./pages/UserActivity'),
            );
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
            const FunnelBuilder = await loadLazyRouteDefault(
                './features/funnelBuilder/FunnelBuilderPage',
                () => import('./features/funnelBuilder/FunnelBuilderPage'),
            );
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
                    const Projects = await loadLazyRouteDefault(
                        './pages/Projects',
                        () => import('./pages/Projects'),
                    );
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
                            const LegacySqlRunner = await loadLazyRouteDefault(
                                './pages/LegacySqlRunner',
                                () => import('./pages/LegacySqlRunner'),
                            );
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
                path: '/onboarding/agent',
                handle: { hideAILauncher: true },
                lazy: async () => {
                    const OnboardingAgent = await loadLazyRouteDefault(
                        './pages/OnboardingAgent',
                        () => import('./pages/OnboardingAgent'),
                    );
                    return {
                        Component: () => (
                            <>
                                <NavBar />
                                <TrackPage name={PageName.ONBOARDING_AGENT}>
                                    <OnboardingAgent />
                                </TrackPage>
                            </>
                        ),
                    };
                },
            },
            {
                path: '/onboarding/data-source/:warehouse?',
                handle: { hideAILauncher: true },
                lazy: async () => {
                    const OnboardingDataSource = await loadLazyRouteDefault(
                        './pages/OnboardingDataSource',
                        () => import('./pages/OnboardingDataSource'),
                    );
                    return {
                        Component: () => (
                            <TrackPage name={PageName.ONBOARDING_DATA_SOURCE}>
                                <OnboardingDataSource />
                            </TrackPage>
                        ),
                    };
                },
            },
            {
                path: '/onboarding/project-ready/:projectUuid',
                handle: { hideAILauncher: true },
                lazy: async () => {
                    const OnboardingProjectReady = await loadLazyRouteDefault(
                        './pages/OnboardingProjectReady',
                        () => import('./pages/OnboardingProjectReady'),
                    );
                    return {
                        Component: () => (
                            <TrackPage name={PageName.ONBOARDING_PROJECT_READY}>
                                <OnboardingProjectReady />
                            </TrackPage>
                        ),
                    };
                },
            },
            {
                path: '/createProject/:method?',
                lazy: async () => {
                    const CreateProject = await loadLazyRouteDefault(
                        './pages/CreateProject',
                        () => import('./pages/CreateProject'),
                    );
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
                    const Settings = await loadLazyRouteDefault(
                        './pages/Settings',
                        () => import('./pages/Settings'),
                    );
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
                    const ShareRedirect = await loadLazyRouteDefault(
                        './pages/ShareRedirect',
                        () => import('./pages/ShareRedirect'),
                    );
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
