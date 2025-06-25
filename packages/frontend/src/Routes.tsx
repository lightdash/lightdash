import { Stack } from '@mantine/core';
import { type FC } from 'react';
import { Navigate, Outlet, useParams, type RouteObject } from 'react-router';
import AppRoute from './components/AppRoute';
import ForbiddenPanel from './components/ForbiddenPanel';
import JobDetailsDrawer from './components/JobDetailsDrawer';
import NavBar from './components/NavBar';
import PrivateRoute from './components/PrivateRoute';
import ProjectRoute from './components/ProjectRoute';
import UserCompletionModal from './components/UserCompletionModal';
import { MetricCatalogView } from './features/metricsCatalog/types';
import AuthPopupResult from './pages/AuthPopupResult';
import Catalog from './pages/Catalog';
import ChartHistory from './pages/ChartHistory';
import CreateProject from './pages/CreateProject';
import CreateProjectSettings from './pages/CreateProjectSettings';
import Dashboard from './pages/Dashboard';
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
import Space from './pages/Space';
import Spaces from './pages/Spaces';
import SqlRunner from './pages/SqlRunner';
import UserActivity from './pages/UserActivity';
import VerifyEmailPage from './pages/VerifyEmail';
import ViewSqlChart from './pages/ViewSqlChart';
import { TrackPage } from './providers/Tracking/TrackingProvider';
import { PageName } from './types/Events';

const DashboardPageWrapper: FC = () => {
    const { dashboardUuid } = useParams<{ dashboardUuid: string }>();

    return (
        <>
            <NavBar />
            <TrackPage name={PageName.DASHBOARD}>
                <Dashboard key={dashboardUuid} />
            </TrackPage>
        </>
    );
};

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
        ],
    },
];

const CHART_ROUTES: RouteObject[] = [
    {
        path: '/projects/:projectUuid/saved',
        element: (
            <>
                <NavBar />
                <TrackPage name={PageName.SAVED_QUERIES}>
                    <SavedQueries />
                </TrackPage>
            </>
        ),
    },
    {
        path: '/projects/:projectUuid/saved/:savedQueryUuid',
        element: (
            <>
                <NavBar />
                <Outlet />
            </>
        ),
        children: [
            {
                path: '/projects/:projectUuid/saved/:savedQueryUuid/history',
                element: (
                    <TrackPage name={PageName.CHART_HISTORY}>
                        <ChartHistory />
                    </TrackPage>
                ),
            },
            {
                path: '/projects/:projectUuid/saved/:savedQueryUuid/:mode?',
                element: (
                    <TrackPage name={PageName.SAVED_QUERY_EXPLORER}>
                        <SavedExplorer />
                    </TrackPage>
                ),
            },
        ],
    },
];

const DASHBOARD_ROUTES: RouteObject[] = [
    {
        path: '/projects/:projectUuid/dashboards',
        element: (
            <>
                <NavBar />
                <TrackPage name={PageName.SAVED_DASHBOARDS}>
                    <SavedDashboards />
                </TrackPage>
            </>
        ),
    },
    {
        path: '/projects/:projectUuid/dashboards/:dashboardUuid',
        children: [
            {
                path: '/projects/:projectUuid/dashboards/:dashboardUuid/:mode?',
                element: <DashboardPageWrapper />,
            },
            {
                path: '/projects/:projectUuid/dashboards/:dashboardUuid/:mode/tabs/:tabUuid?',
                element: <DashboardPageWrapper />,
            },
        ],
    },
];

const SQL_RUNNER_ROUTES: RouteObject[] = [
    {
        path: '/projects/:projectUuid/sqlRunner',
        // Support old share links. Redirects to new route.
        element: <LegacySqlRunner />,
    },
    {
        path: '/projects/:projectUuid/sql-runner',
        element: (
            <>
                <NavBar />
                <Outlet />
            </>
        ),
        children: [
            {
                path: '/projects/:projectUuid/sql-runner',
                element: <SqlRunner />,
            },
            {
                path: '/projects/:projectUuid/sql-runner/:slug',
                element: <ViewSqlChart />,
            },
            {
                path: '/projects/:projectUuid/sql-runner:slug/edit',
                element: <SqlRunner isEditMode />,
            },
        ],
    },
];

const TABLES_ROUTES: RouteObject[] = [
    {
        path: '/projects/:projectUuid/tables',
        element: (
            <>
                <NavBar />
                <TrackPage name={PageName.EXPLORE_TABLES}>
                    <Explorer />
                </TrackPage>
            </>
        ),
    },
    {
        path: '/projects/:projectUuid/tables/:tableId',
        element: (
            <>
                <NavBar />
                <TrackPage name={PageName.EXPLORER}>
                    <Explorer />
                </TrackPage>
            </>
        ),
    },
];

const SPACES_ROUTES: RouteObject[] = [
    {
        path: '/projects/:projectUuid/spaces',
        element: (
            <>
                <NavBar />
                <TrackPage name={PageName.SPACES}>
                    <Spaces />
                </TrackPage>
            </>
        ),
    },
    {
        path: '/projects/:projectUuid/spaces/:spaceUuid',
        element: (
            <>
                <NavBar />
                <TrackPage name={PageName.SPACE}>
                    <Space />
                </TrackPage>
            </>
        ),
    },
];

const METRICS_ROUTES: RouteObject[] = [
    {
        path: '/projects/:projectUuid/metrics',
        element: (
            <>
                <NavBar />
                <TrackPage name={PageName.METRICS_CATALOG}>
                    <MetricsCatalog />
                </TrackPage>
            </>
        ),
    },
    {
        path: '/projects/:projectUuid/metrics/peek/:tableName/:metricName',
        element: (
            <>
                <NavBar />
                <TrackPage name={PageName.METRICS_CATALOG}>
                    <MetricsCatalog />
                </TrackPage>
            </>
        ),
    },
    {
        path: '/projects/:projectUuid/metrics/canvas',
        element: (
            <>
                <NavBar />
                <TrackPage name={PageName.METRICS_CATALOG}>
                    <MetricsCatalog
                        metricCatalogView={MetricCatalogView.CANVAS}
                    />
                </TrackPage>
            </>
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
                    ...TABLES_ROUTES,
                    ...SQL_RUNNER_ROUTES,
                    ...CHART_ROUTES,
                    ...DASHBOARD_ROUTES,
                    ...SPACES_ROUTES,
                    ...METRICS_ROUTES,
                    {
                        path: '/projects/:projectUuid/home',
                        element: (
                            <>
                                <NavBar />
                                <TrackPage name={PageName.HOME}>
                                    <Home />
                                </TrackPage>
                            </>
                        ),
                    },
                    {
                        path: '/projects/:projectUuid/user-activity',
                        element: (
                            <>
                                <NavBar />
                                <TrackPage name={PageName.USER_ACTIVITY}>
                                    <UserActivity />
                                </TrackPage>
                            </>
                        ),
                    },
                    {
                        path: '/projects/:projectUuid/catalog',
                        element: (
                            <>
                                <NavBar />
                                <TrackPage name={PageName.CATALOG}>
                                    <Catalog />
                                </TrackPage>
                            </>
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
