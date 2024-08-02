import { Stack } from '@mantine/core';
import { type FC } from 'react';
import { Redirect, Route, Switch } from 'react-router-dom';

import { TrackPage } from './providers/TrackingProvider';
import { PageName } from './types/Events';

import AppRoute from './components/AppRoute';
import ForbiddenPanel from './components/ForbiddenPanel';
import JobDetailsDrawer from './components/JobDetailsDrawer';
import NavBar from './components/NavBar';
import PrivateRoute from './components/PrivateRoute';
import ProjectRoute from './components/ProjectRoute';
import UserCompletionModal from './components/UserCompletionModal';

import Catalog from './pages/Catalog';
import ChartHistory from './pages/ChartHistory';
import CreateProject from './pages/CreateProject';
import CreateProjectSettings from './pages/CreateProjectSettings';
import Dashboard from './pages/Dashboard';
import Explorer from './pages/Explorer';
import Home from './pages/Home';
import Invite from './pages/Invite';
import JoinOrganization from './pages/JoinOrganization';
import Login from './pages/Login';
import MetricFlowPage from './pages/MetricFlow';
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
import SqlRunnerNew from './pages/SqlRunnerNew';
import UserActivity from './pages/UserActivity';
import VerifyEmailPage from './pages/VerifyEmail';
import ViewSqlChart from './pages/ViewSqlChart';

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

                                    <Route
                                        path="/projects/:projectUuid/dashboards/:dashboardUuid/:mode?/tabs/:tabUuid?"
                                        render={(props) => (
                                            <>
                                                <NavBar />
                                                <TrackPage
                                                    name={PageName.DASHBOARD}
                                                >
                                                    <Dashboard
                                                        key={
                                                            props.match.params
                                                                .tabUuid
                                                        }
                                                    />
                                                </TrackPage>
                                            </>
                                        )}
                                    />

                                    <Route
                                        path="/projects/:projectUuid/dashboards/:dashboardUuid/:mode?"
                                        render={(props) => (
                                            <>
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
                                            </>
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

                                    <Route
                                        exact
                                        path="/projects/:projectUuid/sql-runner/:slug"
                                    >
                                        <NavBar />

                                        <ViewSqlChart />
                                    </Route>

                                    <Route
                                        exact
                                        path="/projects/:projectUuid/sql-runner/:slug/edit"
                                    >
                                        <NavBar />

                                        <SqlRunnerNew />
                                    </Route>

                                    <Route
                                        exact
                                        path="/projects/:projectUuid/sql-runner"
                                    >
                                        <NavBar />

                                        <SqlRunnerNew />
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

                                    <Route
                                        path="/projects/:projectUuid/catalog"
                                        exact
                                    >
                                        <NavBar />
                                        <TrackPage name={PageName.CATALOG}>
                                            <Catalog />
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
