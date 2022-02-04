import { Colors, HotkeysProvider } from '@blueprintjs/core';
import '@blueprintjs/core/lib/css/blueprint.css';
import '@blueprintjs/popover2/lib/css/blueprint-popover2.css';
import '@blueprintjs/table/lib/css/table.css';
import React from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';
import {
    BrowserRouter as Router,
    Redirect,
    Route,
    Switch,
} from 'react-router-dom';
import './App.css';
import AppBar from './components/AppBar';
import AppRoute from './components/AppRoute';
import MobileView from './components/Mobile';
import PrivateRoute from './components/PrivateRoute';
import UserCompletionModal from './components/UserCompletionModal';
import CreateProject from './pages/CreateProject';
import CreateProjectSettings from './pages/CreateProjectSettings';
import Dashboard from './pages/Dashboard';
import Explorer from './pages/Explorer';
import Home from './pages/Home';
import Login from './pages/Login';
import PasswordRecovery from './pages/PasswordRecovery';
import PasswordReset from './pages/PasswordReset';
import { Projects } from './pages/Projects';
import ProjectSettings from './pages/ProjectSettings';
import Register from './pages/Register';
import SavedDashboards from './pages/SavedDashboards';
import SavedExplorer from './pages/SavedExplorer';
import SavedQueries from './pages/SavedQueries';
import Signup from './pages/Signup';
import SqlRunner from './pages/SqlRunner';
import Welcome from './pages/Welcome';
import { AppProvider } from './providers/AppProvider';
import { DashboardProvider } from './providers/DashboardProvider';
import { ExplorerProvider } from './providers/ExplorerProvider';
import { TrackingProvider, TrackPage } from './providers/TrackingProvider';
import { PageName } from './types/Events';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            refetchOnWindowFocus: false,
            onError: async (result) => {
                // @ts-ignore
                const { error: { statusCode } = {} } = result;
                if (statusCode === 401) {
                    await queryClient.invalidateQueries('health');
                }
            },
        },
    },
});

const isMobile =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent,
    ) || window.innerWidth < 768;

const App = () => (
    <QueryClientProvider client={queryClient}>
        <HotkeysProvider>
            <AppProvider>
                <TrackingProvider>
                    {isMobile ? (
                        <MobileView />
                    ) : (
                        <Router>
                            <Switch>
                                <Route path="/welcome">
                                    <TrackPage name={PageName.WELCOME}>
                                        <Welcome />
                                    </TrackPage>
                                </Route>
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
                                    <TrackPage
                                        name={PageName.PASSWORD_RECOVERY}
                                    >
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
                                        <Signup />
                                    </TrackPage>
                                </Route>
                                <PrivateRoute path="/">
                                    <div
                                        style={{
                                            minHeight: '100vh',
                                            background: Colors.LIGHT_GRAY5,
                                        }}
                                    >
                                        <UserCompletionModal />
                                        <Switch>
                                            <Route path="/createProject">
                                                <AppBar />
                                                <TrackPage
                                                    name={
                                                        PageName.CREATE_PROJECT
                                                    }
                                                >
                                                    <CreateProject />
                                                </TrackPage>
                                            </Route>
                                            <Route path="/createProjectSettings/:projectUuid">
                                                <AppBar />
                                                <TrackPage
                                                    name={
                                                        PageName.CREATE_PROJECT_SETTINGS
                                                    }
                                                >
                                                    <CreateProjectSettings />
                                                </TrackPage>
                                            </Route>
                                            <AppRoute path="/">
                                                <Switch>
                                                    <Route path="/projects/:projectUuid/settings/:tab?">
                                                        <AppBar />
                                                        <TrackPage
                                                            name={
                                                                PageName.PROJECT_SETTINGS
                                                            }
                                                        >
                                                            <ProjectSettings />
                                                        </TrackPage>
                                                    </Route>
                                                    <Route path="/projects/:projectUuid/saved/:savedQueryUuid">
                                                        <AppBar />
                                                        <TrackPage
                                                            name={
                                                                PageName.SAVED_QUERY_EXPLORER
                                                            }
                                                        >
                                                            <ExplorerProvider>
                                                                <SavedExplorer />
                                                            </ExplorerProvider>
                                                        </TrackPage>
                                                    </Route>
                                                    <Route path="/projects/:projectUuid/saved">
                                                        <AppBar />
                                                        <TrackPage
                                                            name={
                                                                PageName.SAVED_QUERIES
                                                            }
                                                        >
                                                            <SavedQueries />
                                                        </TrackPage>
                                                    </Route>
                                                    <Route path="/projects/:projectUuid/dashboards/:dashboardUuid/:mode?">
                                                        <AppBar />
                                                        <TrackPage
                                                            name={
                                                                PageName.DASHBOARD
                                                            }
                                                        >
                                                            <DashboardProvider>
                                                                <Dashboard />
                                                            </DashboardProvider>
                                                        </TrackPage>
                                                    </Route>
                                                    <Route path="/projects/:projectUuid/dashboards">
                                                        <AppBar />
                                                        <TrackPage
                                                            name={
                                                                PageName.SAVED_DASHBOARDS
                                                            }
                                                        >
                                                            <SavedDashboards />
                                                        </TrackPage>
                                                    </Route>
                                                    <Route path="/projects/:projectUuid/sqlRunner">
                                                        <AppBar />
                                                        <TrackPage
                                                            name={
                                                                PageName.SQL_RUNNER
                                                            }
                                                        >
                                                            <SqlRunner />
                                                        </TrackPage>
                                                    </Route>
                                                    <Route path="/projects/:projectUuid/tables/:tableId">
                                                        <AppBar />
                                                        <TrackPage
                                                            name={
                                                                PageName.EXPLORER
                                                            }
                                                        >
                                                            <ExplorerProvider>
                                                                <Explorer />
                                                            </ExplorerProvider>
                                                        </TrackPage>
                                                    </Route>
                                                    <Route path="/projects/:projectUuid/tables">
                                                        <AppBar />
                                                        <TrackPage
                                                            name={
                                                                PageName.EXPLORE_TABLES
                                                            }
                                                        >
                                                            <ExplorerProvider>
                                                                <Explorer />
                                                            </ExplorerProvider>
                                                        </TrackPage>
                                                    </Route>
                                                    <Route
                                                        path="/projects"
                                                        exact
                                                    >
                                                        <Projects />
                                                    </Route>
                                                    <Route path="/home" exact>
                                                        <AppBar />
                                                        <TrackPage
                                                            name={PageName.HOME}
                                                        >
                                                            <Home />
                                                        </TrackPage>
                                                    </Route>
                                                    <Redirect to="/home" />
                                                </Switch>
                                            </AppRoute>
                                        </Switch>
                                    </div>
                                </PrivateRoute>
                            </Switch>
                        </Router>
                    )}
                </TrackingProvider>
            </AppProvider>
        </HotkeysProvider>
    </QueryClientProvider>
);

export default App;
