import { Stack } from '@mantine/core';
import { Navigate, Outlet, type RouteObject } from 'react-router';
import AppRoute from './components/AppRoute';
import DashboardLayout from './components/common/DashboardLayout';
import ProjectLayout from './components/common/ProjectLayout';
import ForbiddenPanel from './components/ForbiddenPanel';
import JobDetailsDrawer from './components/JobDetailsDrawer';
import NavBar from './components/NavBar';
import PrivateRoute from './components/PrivateRoute';
import ProjectRoute from './components/ProjectRoute';
import UserCompletionModal from './components/UserCompletionModal';
import FunnelBuilder from './features/funnelBuilder/FunnelBuilderPage';
import { MetricCatalogView } from './features/metricsCatalog/types';
import AuthPopupResult from './pages/AuthPopupResult';
import ChartHistory from './pages/ChartHistory';
import CreateProject from './pages/CreateProject';
import CreateProjectSettings from './pages/CreateProjectSettings';
import Dashboard from './pages/Dashboard';
import DashboardHistory from './pages/DashboardHistory';
import Explorer from './pages/Explorer';
import Home from './pages/Home';
import Invite from './pages/Invite';
import JoinOrganization from './pages/JoinOrganization';
import LegacySqlRunner from './pages/LegacySqlRunner';
import Login from './pages/Login';
import MetricsCatalog from './pages/MetricsCatalog';
import MinimalDashboard from './pages/MinimalDashboard';
import MinimalSavedExplorer from './pages/MinimalSavedExplorer';
import PasswordRecovery from './pages/PasswordRecovery';
import PasswordReset from './pages/PasswordReset';
import Projects from './pages/Projects';
import Register from './pages/Register';
import SavedDashboards from './pages/SavedDashboards';
import SavedExplorer from './pages/SavedExplorer';
import SavedQueries from './pages/SavedQueries';
import Settings from './pages/Settings';
import ShareRedirect from './pages/ShareRedirect';
import SourceCodeEditorRedirect from './pages/SourceCodeEditorRedirect';
import Space from './pages/Space';
import Spaces from './pages/Spaces';
import SqlRunner from './pages/SqlRunner';
import UnusedContent from './pages/UnusedContent';
import UserActivity from './pages/UserActivity';
import VerifyEmailPage from './pages/VerifyEmail';
import ViewSqlChart from './pages/ViewSqlChart';
import { TrackPage } from './providers/Tracking/TrackingProvider';
import { PageName } from './types/Events';

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
        path: '/register',
        element: (
            <TrackPage name={PageName.REGISTER}>
                <Register />
            </TrackPage>
        ),
    },
    {
        path: '/login',
        element: (
            <TrackPage name={PageName.LOGIN}>
                <Login />
            </TrackPage>
        ),
    },
    {
        path: '/recover-password',
        element: (
            <TrackPage name={PageName.PASSWORD_RECOVERY}>
                <PasswordRecovery />
            </TrackPage>
        ),
    },
    {
        path: '/reset-password/:code',
        element: (
            <TrackPage name={PageName.PASSWORD_RESET}>
                <PasswordReset />
            </TrackPage>
        ),
    },
    {
        path: '/invite/:inviteCode',
        element: (
            <TrackPage name={PageName.SIGNUP}>
                <Invite />
            </TrackPage>
        ),
    },
    {
        path: '/verify-email',
        element: (
            <TrackPage name={PageName.VERIFY_EMAIL}>
                <VerifyEmailPage />
            </TrackPage>
        ),
    },
    {
        path: '/join-organization',
        element: (
            <TrackPage name={PageName.JOIN_ORGANIZATION}>
                <JoinOrganization />
            </TrackPage>
        ),
    },
];

const MINIMAL_ROUTES: RouteObject[] = [
    {
        path: '/minimal',
        children: [
            {
                path: '/minimal/projects/:projectUuid/saved/:savedQueryUuid',
                element: (
                    <Stack p="lg" h="100vh">
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

const CHART_ROUTES: RouteObject[] = [
    {
        path: 'saved',
        element: (
            <TrackPage name={PageName.SAVED_QUERIES}>
                <SavedQueries />
            </TrackPage>
        ),
    },
    {
        path: 'saved/:savedQueryUuid',
        element: <Outlet />,
        children: [
            {
                path: 'history',
                element: (
                    <TrackPage name={PageName.CHART_HISTORY}>
                        <ChartHistory />
                    </TrackPage>
                ),
            },
            {
                path: ':mode?',
                index: false,
                element: (
                    <TrackPage name={PageName.SAVED_QUERY_EXPLORER}>
                        <SavedExplorer />
                    </TrackPage>
                ),
            },
        ],
    },
];

// Dashboard list route (uses ProjectLayout's fixed NavBar)
const DASHBOARD_LIST_ROUTES: RouteObject[] = [
    {
        path: 'dashboards',
        element: (
            <TrackPage name={PageName.SAVED_DASHBOARDS}>
                <SavedDashboards />
            </TrackPage>
        ),
    },
    {
        path: 'dashboards/:dashboardUuid/history',
        element: (
            <TrackPage name={PageName.DASHBOARD_HISTORY}>
                <DashboardHistory />
            </TrackPage>
        ),
    },
];

// Dashboard view routes (use DashboardLayout with non-fixed NavBar)
const DASHBOARD_VIEW_ROUTES: RouteObject[] = [
    {
        path: 'dashboards/:dashboardUuid',
        element: <DashboardLayout />,
        children: [
            {
                path: ':mode?',
                index: false,
                element: (
                    <TrackPage name={PageName.DASHBOARD}>
                        <Dashboard />
                    </TrackPage>
                ),
            },
            {
                path: ':mode/tabs/:tabUuid?',
                element: (
                    <TrackPage name={PageName.DASHBOARD}>
                        <Dashboard />
                    </TrackPage>
                ),
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
                element: <SqlRunner />,
            },
            {
                path: ':slug',
                element: <ViewSqlChart />,
            },
            {
                path: ':slug/edit',
                element: <SqlRunner isEditMode />,
            },
        ],
    },
];

const SOURCE_CODE_ROUTES: RouteObject[] = [
    {
        // Redirect old source-code route to project home with editor drawer open
        path: 'source-code',
        element: <SourceCodeEditorRedirect />,
    },
];

const TABLES_ROUTES: RouteObject[] = [
    {
        path: 'tables',
        element: (
            <TrackPage name={PageName.EXPLORE_TABLES}>
                <Explorer />
            </TrackPage>
        ),
    },
    {
        path: 'tables/:tableId',
        element: (
            <TrackPage name={PageName.EXPLORER}>
                <Explorer />
            </TrackPage>
        ),
    },
];

const SPACES_ROUTES: RouteObject[] = [
    {
        path: 'spaces',
        element: (
            <TrackPage name={PageName.SPACES}>
                <Spaces />
            </TrackPage>
        ),
    },
    {
        path: 'spaces/:spaceUuid',
        element: (
            <TrackPage name={PageName.SPACE}>
                <Space />
            </TrackPage>
        ),
    },
];

const METRICS_ROUTES: RouteObject[] = [
    {
        path: 'metrics',
        element: (
            <TrackPage name={PageName.METRICS_CATALOG}>
                <MetricsCatalog />
            </TrackPage>
        ),
    },
    {
        path: 'metrics/peek/:tableName/:metricName',
        element: (
            <TrackPage name={PageName.METRICS_CATALOG}>
                <MetricsCatalog />
            </TrackPage>
        ),
    },
    {
        path: 'metrics/canvas',
        element: (
            <TrackPage name={PageName.METRICS_CATALOG}>
                <MetricsCatalog metricCatalogView={MetricCatalogView.CANVAS} />
            </TrackPage>
        ),
    },
    {
        path: 'metrics/canvas/:treeSlug',
        element: (
            <TrackPage name={PageName.METRICS_CATALOG}>
                <MetricsCatalog metricCatalogView={MetricCatalogView.CANVAS} />
            </TrackPage>
        ),
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
        element: (
            <TrackPage name={PageName.HOME}>
                <Home />
            </TrackPage>
        ),
    },
    {
        path: 'user-activity',
        element: (
            <TrackPage name={PageName.USER_ACTIVITY}>
                <UserActivity />
            </TrackPage>
        ),
    },
    {
        path: 'unused-content',
        element: (
            <TrackPage name={PageName.USER_ACTIVITY}>
                <UnusedContent />
            </TrackPage>
        ),
    },
    {
        path: 'funnel-builder',
        element: (
            <TrackPage name={PageName.FUNNEL_BUILDER}>
                <FunnelBuilder />
            </TrackPage>
        ),
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
                    // Legacy sqlRunner redirect (no layout needed)
                    {
                        path: 'sqlRunner',
                        element: <LegacySqlRunner />,
                    },
                    // Routes with fixed NavBar via ProjectLayout
                    {
                        element: <ProjectLayout />,
                        children: PROJECT_LAYOUT_ROUTES,
                    },
                    // Dashboard view routes with non-fixed NavBar via DashboardLayout
                    ...DASHBOARD_VIEW_ROUTES,
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
                element: (
                    <>
                        <NavBar />
                        <TrackPage name={PageName.CREATE_PROJECT}>
                            <CreateProject />
                        </TrackPage>
                    </>
                ),
            },
            {
                path: '/createProjectSettings/:projectUuid',
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
                element: (
                    <>
                        <NavBar />
                        <TrackPage name={PageName.GENERAL_SETTINGS}>
                            <Settings />
                        </TrackPage>
                    </>
                ),
            },
            {
                path: '/no-access',
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
                element: (
                    <>
                        <NavBar />
                        <TrackPage name={PageName.SHARE}>
                            <ShareRedirect />
                        </TrackPage>
                    </>
                ),
            },
        ],
    },
];

const WebAppRoutes = [...PUBLIC_ROUTES, ...PRIVATE_ROUTES, FALLBACK_ROUTE];
export default WebAppRoutes;
