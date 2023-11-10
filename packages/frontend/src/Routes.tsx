import { Stack } from '@mantine/core';
import React, { ComponentProps, FC, lazy, Suspense } from 'react';
import { Redirect, Route, Switch } from 'react-router-dom';

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

const LazyLoadPage: FC<
    ComponentProps<typeof TrackPage> & { trackingEnabled?: boolean }
> = ({ children, trackingEnabled = true, ...props }) => {
    if (trackingEnabled)
        return (
            <TrackPage name={props.name}>
                <Suspense fallback={<PageSpinner />}>{children}</Suspense>
            </TrackPage>
        );
    return <Suspense fallback={<PageSpinner />}>{children}</Suspense>;
};

const Routes: FC = () => {
    return (
        <Switch>
            <PrivateRoute path="/minimal">
                <Switch>
                    <Route path="/minimal/projects/:projectUuid/saved/:savedQueryUuid">
                        <LazyLoadPage
                            name={PageName.MINIMAL_SAVED_QUERIES}
                            trackingEnabled={false}
                        >
                            <Stack p="lg" h="100vh">
                                <MinimalSavedExplorer />
                            </Stack>
                        </LazyLoadPage>
                    </Route>

                    <Route path="/minimal/projects/:projectUuid/dashboards/:dashboardUuid">
                        <LazyLoadPage
                            name={PageName.MINIMAL_DASHBOARD}
                            trackingEnabled={false}
                        >
                            <MinimalDashboard />
                        </LazyLoadPage>
                    </Route>
                </Switch>
            </PrivateRoute>

            <Route path="/register">
                <LazyLoadPage name={PageName.REGISTER}>
                    <Register />
                </LazyLoadPage>
            </Route>

            <Route path="/login">
                <LazyLoadPage name={PageName.LOGIN}>
                    <Login />
                </LazyLoadPage>
            </Route>

            <Route path="/recover-password">
                <LazyLoadPage name={PageName.PASSWORD_RECOVERY}>
                    <PasswordRecovery />
                </LazyLoadPage>
            </Route>

            <Route path="/reset-password/:code">
                <LazyLoadPage name={PageName.PASSWORD_RESET}>
                    <PasswordReset />
                </LazyLoadPage>
            </Route>

            <Route path="/invite/:inviteCode">
                <LazyLoadPage name={PageName.SIGNUP}>
                    <Invite />
                </LazyLoadPage>
            </Route>
            <Route path="/verify-email">
                <LazyLoadPage name={PageName.VERIFY_EMAIL}>
                    <VerifyEmailPage />
                </LazyLoadPage>
            </Route>

            <Route path="/join-organization">
                <LazyLoadPage name={PageName.JOIN_ORGANIZATION}>
                    <JoinOrganization />
                </LazyLoadPage>
            </Route>

            <PrivateRoute path="/">
                <UserCompletionModal />
                <JobDetailsDrawer />
                <Switch>
                    <Route path="/createProject/:method?">
                        <NavBar />
                        <LazyLoadPage name={PageName.CREATE_PROJECT}>
                            <CreateProject />
                        </LazyLoadPage>
                    </Route>
                    <Route path="/createProjectSettings/:projectUuid">
                        <NavBar />
                        <LazyLoadPage name={PageName.CREATE_PROJECT_SETTINGS}>
                            <CreateProjectSettings />
                        </LazyLoadPage>
                    </Route>
                    <Route path="/generalSettings/:tab?">
                        <NavBar />
                        <LazyLoadPage name={PageName.GENERAL_SETTINGS}>
                            <Settings />
                        </LazyLoadPage>
                    </Route>
                    <Route path="/no-access">
                        <NavBar />
                        <LazyLoadPage name={PageName.NO_ACCESS}>
                            <ForbiddenPanel />
                        </LazyLoadPage>
                    </Route>
                    <Route path="/no-project-access">
                        <NavBar />
                        <LazyLoadPage name={PageName.NO_PROJECT_ACCESS}>
                            <ForbiddenPanel subject="project" />
                        </LazyLoadPage>
                    </Route>
                    <Route path="/share/:shareNanoid">
                        <NavBar />
                        <LazyLoadPage name={PageName.SHARE}>
                            <ShareRedirect />
                        </LazyLoadPage>
                    </Route>

                    <AppRoute path="/">
                        <Switch>
                            <ProjectRoute path="/projects/:projectUuid">
                                <Switch>
                                    <Route path="/projects/:projectUuid/saved/:savedQueryUuid/history">
                                        <NavBar />
                                        <LazyLoadPage
                                            name={PageName.CHART_HISTORY}
                                        >
                                            <ChartHistory />
                                        </LazyLoadPage>
                                    </Route>
                                    <Route path="/projects/:projectUuid/saved/:savedQueryUuid/:mode?">
                                        <NavBar />
                                        <LazyLoadPage
                                            name={PageName.SAVED_QUERY_EXPLORER}
                                        >
                                            <SavedExplorer />
                                        </LazyLoadPage>
                                    </Route>

                                    <Route path="/projects/:projectUuid/saved">
                                        <NavBar />
                                        <LazyLoadPage
                                            name={PageName.SAVED_QUERIES}
                                        >
                                            <SavedQueries />
                                        </LazyLoadPage>
                                    </Route>

                                    <Route
                                        path="/projects/:projectUuid/dashboards/:dashboardUuid/:mode?"
                                        render={(props) => (
                                            <>
                                                <NavBar />
                                                <LazyLoadPage
                                                    name={PageName.DASHBOARD}
                                                >
                                                    <Dashboard
                                                        key={
                                                            props.match.params
                                                                .dashboardUuid
                                                        }
                                                    />
                                                </LazyLoadPage>
                                            </>
                                        )}
                                    />

                                    <Route path="/projects/:projectUuid/dashboards">
                                        <NavBar />
                                        <LazyLoadPage
                                            name={PageName.SAVED_DASHBOARDS}
                                        >
                                            <SavedDashboards />
                                        </LazyLoadPage>
                                    </Route>

                                    <Route path="/projects/:projectUuid/sqlRunner">
                                        <NavBar />
                                        <LazyLoadPage
                                            name={PageName.SQL_RUNNER}
                                        >
                                            <SqlRunner />
                                        </LazyLoadPage>
                                    </Route>

                                    <Route path="/projects/:projectUuid/dbtsemanticlayer">
                                        <NavBar />
                                        <LazyLoadPage
                                            name={PageName.METRIC_FLOW}
                                        >
                                            <MetricFlowPage />
                                        </LazyLoadPage>
                                    </Route>

                                    <Route path="/projects/:projectUuid/tables/:tableId">
                                        <NavBar />
                                        <LazyLoadPage name={PageName.EXPLORER}>
                                            <Explorer />
                                        </LazyLoadPage>
                                    </Route>

                                    <Route path="/projects/:projectUuid/tables">
                                        <NavBar />
                                        <LazyLoadPage
                                            name={PageName.EXPLORE_TABLES}
                                        >
                                            <Explorer />
                                        </LazyLoadPage>
                                    </Route>

                                    <Route path="/projects/:projectUuid/spaces/:spaceUuid">
                                        <NavBar />
                                        <LazyLoadPage name={PageName.SPACE}>
                                            <Space />
                                        </LazyLoadPage>
                                    </Route>

                                    <Route path="/projects/:projectUuid/spaces">
                                        <NavBar />
                                        <LazyLoadPage name={PageName.SPACES}>
                                            <Spaces />
                                        </LazyLoadPage>
                                    </Route>

                                    <Route
                                        path="/projects/:projectUuid/home"
                                        exact
                                    >
                                        <NavBar />
                                        <LazyLoadPage name={PageName.HOME}>
                                            <Home />
                                        </LazyLoadPage>
                                    </Route>

                                    <Route
                                        path="/projects/:projectUuid/user-activity"
                                        exact
                                    >
                                        <NavBar />
                                        <LazyLoadPage
                                            name={PageName.USER_ACTIVITY}
                                        >
                                            <UserActivity />
                                        </LazyLoadPage>
                                    </Route>

                                    <Redirect to="/projects" />
                                </Switch>
                            </ProjectRoute>

                            <Route path="/projects/:projectUuid?" exact>
                                <Suspense fallback={<PageSpinner />}>
                                    <Projects />
                                </Suspense>
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
