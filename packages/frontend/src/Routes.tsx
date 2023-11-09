import { Stack } from '@mantine/core';
import React, { ComponentProps, FC, lazy, Suspense } from 'react';
import { Redirect, Route as ReactRouterRoute, Switch } from 'react-router-dom';

import { TrackPage } from './providers/TrackingProvider';
import { PageName } from './types/Events';

import AppRoute from './components/AppRoute';
import ForbiddenPanel from './components/ForbiddenPanel';
import JobDetailsDrawer from './components/JobDetailsDrawer';
import NavBar from './components/NavBar';
import PageSpinner from './components/PageSpinner';
import PrivateRoute from './components/PrivateRoute';
import ProjectRoute from './components/ProjectRoute';
import UserCompletionModal from './components/UserCompletionModal';

const ChartHistory = lazy(() => import('./pages/ChartHistory'));
const CreateProject = lazy(() => import('./pages/CreateProject'));
const CreateProjectSettings = lazy(
    () => import('./pages/CreateProjectSettings'),
);
const Home = lazy(() => import('./pages/Home'));
const Invite = lazy(() => import('./pages/Invite'));
const JoinOrganization = lazy(() => import('./pages/JoinOrganization'));
const Login = lazy(() => import('./pages/Login'));
const MetricFlowPage = lazy(() => import('./pages/MetricFlow'));
const PasswordReset = lazy(() => import('./pages/PasswordReset'));
const PasswordRecovery = lazy(() => import('./pages/PasswordRecovery'));
const MinimalSavedExplorer = lazy(() => import('./pages/MinimalSavedExplorer'));
const MinimalDashboard = lazy(() => import('./pages/MinimalDashboard'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Explorer = lazy(() => import('./pages/Explorer'));
const Projects = lazy(() => import('./pages/Projects'));
const Register = lazy(() => import('./pages/Register'));
const SavedDashboards = lazy(() => import('./pages/SavedDashboards'));
const SavedExplorer = lazy(() => import('./pages/SavedExplorer'));
const SavedQueries = lazy(() => import('./pages/SavedQueries'));
const Settings = lazy(() => import('./pages/Settings'));
const ShareRedirect = lazy(() => import('./pages/ShareRedirect'));
const Space = lazy(() => import('./pages/Space'));
const Spaces = lazy(() => import('./pages/Spaces'));
const SqlRunner = lazy(() => import('./pages/SqlRunner'));
const UserActivity = lazy(() => import('./pages/UserActivity'));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmail'));

const Route: FC<ComponentProps<typeof ReactRouterRoute>> = (props) => {
    return (
        <ReactRouterRoute {...props}>
            <Suspense fallback={<PageSpinner />}>
                <>{props.children}</>
            </Suspense>
        </ReactRouterRoute>
    );
};

const Routes: FC = () => {
    return (
        <Switch>
            <PrivateRoute path="/minimal">
                <Switch>
                    <Route path="/minimal/projects/:projectUuid/saved/:savedQueryUuid">
                        <Stack p="lg" h="100vh">
                            <MinimalSavedExplorer />
                        </Stack>
                    </Route>

                    <Route path="/minimal/projects/:projectUuid/dashboards/:dashboardUuid">
                        <MinimalDashboard />
                    </Route>
                </Switch>
            </PrivateRoute>

            <Route path="/register">
                <TrackPage name={PageName.REGISTER}>
                    <Register />
                </TrackPage>
            </Route>

            <Route path="/login">
                <TrackPage name={PageName.LOGIN}>
                    <Login />
                </TrackPage>
            </Route>

            <Route path="/recover-password">
                <TrackPage name={PageName.PASSWORD_RECOVERY}>
                    <PasswordRecovery />
                </TrackPage>
            </Route>

            <Route path="/reset-password/:code">
                <TrackPage name={PageName.PASSWORD_RESET}>
                    <PasswordReset />
                </TrackPage>
            </Route>

            <Route path="/invite/:inviteCode">
                <TrackPage name={PageName.SIGNUP}>
                    <Invite />
                </TrackPage>
            </Route>
            <Route path="/verify-email">
                <TrackPage name={PageName.VERIFY_EMAIL}>
                    <VerifyEmailPage />
                </TrackPage>
            </Route>

            <Route path="/join-organization">
                <TrackPage name={PageName.JOIN_ORGANIZATION}>
                    <JoinOrganization />
                </TrackPage>
            </Route>

            <PrivateRoute path="/">
                <UserCompletionModal />
                <JobDetailsDrawer />
                <Switch>
                    <Route path="/createProject/:method?">
                        <NavBar />
                        <TrackPage name={PageName.CREATE_PROJECT}>
                            <CreateProject />
                        </TrackPage>
                    </Route>
                    <Route path="/createProjectSettings/:projectUuid">
                        <NavBar />
                        <TrackPage name={PageName.CREATE_PROJECT_SETTINGS}>
                            <CreateProjectSettings />
                        </TrackPage>
                    </Route>
                    <Route path="/generalSettings/:tab?">
                        <NavBar />
                        <TrackPage name={PageName.GENERAL_SETTINGS}>
                            <Settings />
                        </TrackPage>
                    </Route>
                    <Route path="/no-access">
                        <NavBar />
                        <TrackPage name={PageName.NO_ACCESS}>
                            <ForbiddenPanel />
                        </TrackPage>
                    </Route>
                    <Route path="/no-project-access">
                        <NavBar />
                        <TrackPage name={PageName.NO_PROJECT_ACCESS}>
                            <ForbiddenPanel subject="project" />
                        </TrackPage>
                    </Route>
                    <Route path="/share/:shareNanoid">
                        <NavBar />
                        <TrackPage name={PageName.SHARE}>
                            <ShareRedirect />
                        </TrackPage>
                    </Route>

                    <AppRoute path="/">
                        <Switch>
                            <ProjectRoute path="/projects/:projectUuid">
                                <Switch>
                                    <Route path="/projects/:projectUuid/saved/:savedQueryUuid/history">
                                        <NavBar />
                                        <TrackPage
                                            name={PageName.CHART_HISTORY}
                                        >
                                            <ChartHistory />
                                        </TrackPage>
                                    </Route>
                                    <Route path="/projects/:projectUuid/saved/:savedQueryUuid/:mode?">
                                        <NavBar />
                                        <TrackPage
                                            name={PageName.SAVED_QUERY_EXPLORER}
                                        >
                                            <SavedExplorer />
                                        </TrackPage>
                                    </Route>

                                    <Route path="/projects/:projectUuid/saved">
                                        <NavBar />
                                        <TrackPage
                                            name={PageName.SAVED_QUERIES}
                                        >
                                            <SavedQueries />
                                        </TrackPage>
                                    </Route>

                                    <ReactRouterRoute
                                        path="/projects/:projectUuid/dashboards/:dashboardUuid/:mode?"
                                        render={(props) => (
                                            <Suspense
                                                fallback={<PageSpinner />}
                                            >
                                                <NavBar />
                                                <TrackPage
                                                    name={PageName.DASHBOARD}
                                                >
                                                    <Dashboard
                                                        key={
                                                            props.match.params
                                                                .dashboardUuid
                                                        }
                                                    />
                                                </TrackPage>
                                            </Suspense>
                                        )}
                                    />

                                    <Route path="/projects/:projectUuid/dashboards">
                                        <NavBar />
                                        <TrackPage
                                            name={PageName.SAVED_DASHBOARDS}
                                        >
                                            <SavedDashboards />
                                        </TrackPage>
                                    </Route>

                                    <Route path="/projects/:projectUuid/sqlRunner">
                                        <NavBar />
                                        <TrackPage name={PageName.SQL_RUNNER}>
                                            <SqlRunner />
                                        </TrackPage>
                                    </Route>

                                    <Route path="/projects/:projectUuid/dbtsemanticlayer">
                                        <NavBar />
                                        <TrackPage name={PageName.METRIC_FLOW}>
                                            <MetricFlowPage />
                                        </TrackPage>
                                    </Route>

                                    <Route path="/projects/:projectUuid/tables/:tableId">
                                        <NavBar />
                                        <TrackPage name={PageName.EXPLORER}>
                                            <Explorer />
                                        </TrackPage>
                                    </Route>

                                    <Route path="/projects/:projectUuid/tables">
                                        <NavBar />
                                        <TrackPage
                                            name={PageName.EXPLORE_TABLES}
                                        >
                                            <Explorer />
                                        </TrackPage>
                                    </Route>

                                    <Route path="/projects/:projectUuid/spaces/:spaceUuid">
                                        <NavBar />
                                        <TrackPage name={PageName.SPACE}>
                                            <Space />
                                        </TrackPage>
                                    </Route>

                                    <Route path="/projects/:projectUuid/spaces">
                                        <NavBar />
                                        <TrackPage name={PageName.SPACES}>
                                            <Spaces />
                                        </TrackPage>
                                    </Route>

                                    <Route
                                        path="/projects/:projectUuid/home"
                                        exact
                                    >
                                        <NavBar />
                                        <TrackPage name={PageName.HOME}>
                                            <Home />
                                        </TrackPage>
                                    </Route>

                                    <Route
                                        path="/projects/:projectUuid/user-activity"
                                        exact
                                    >
                                        <NavBar />
                                        <TrackPage
                                            name={PageName.USER_ACTIVITY}
                                        >
                                            <UserActivity />
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

export default Routes;
