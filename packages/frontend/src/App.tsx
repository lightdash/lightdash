import { Colors, HotkeysProvider } from '@blueprintjs/core';
import '@blueprintjs/core/lib/css/blueprint.css';
import '@blueprintjs/popover2/lib/css/blueprint-popover2.css';
import '@blueprintjs/table/lib/css/table.css';
import React from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { ReactQueryDevtools } from 'react-query/devtools';
import {
    BrowserRouter as Router,
    Redirect,
    Route,
    Switch,
} from 'react-router-dom';
import './App.css';
import AppBar from './components/AppBar';
import AppRoute from './components/AppRoute';
import PrivateRoute from './components/PrivateRoute';
import CreateProject from './pages/CreateProject';
import CreateProjectSettings from './pages/CreateProjectSettings';
import Dashboard from './pages/Dashboard';
import Explorer from './pages/Explorer';
import Login from './pages/login';
import { Projects } from './pages/Projects';
import ProjectSettings from './pages/ProjectSettings';
import Register from './pages/register';
import SavedDashboards from './pages/SavedDashboards';
import SavedExplorer from './pages/SavedExplorer';
import SavedQueries from './pages/SavedQueries';
import Signup from './pages/Signup';
import SqlRunner from './pages/SqlRunner';
import Welcome from './pages/Welcome';
import { AppProvider } from './providers/AppProvider';
import { ExplorerProvider } from './providers/ExplorerProvider';
import { Page, TrackingProvider } from './providers/TrackingProvider';
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

const App = () => (
    <QueryClientProvider client={queryClient}>
        <HotkeysProvider>
            <AppProvider>
                <TrackingProvider>
                    <Router>
                        <Switch>
                            <Route path="/welcome">
                                <Page name={PageName.WELCOME}>
                                    <Welcome />
                                </Page>
                            </Route>
                            <Route path="/register">
                                <Page name={PageName.REGISTER}>
                                    <Register />
                                </Page>
                            </Route>
                            <Route path="/login">
                                <Page name={PageName.LOGIN}>
                                    <Login />
                                </Page>
                            </Route>
                            <Route path="/invite/:inviteCode">
                                <Page name={PageName.SIGNUP}>
                                    <Signup />
                                </Page>
                            </Route>
                            <PrivateRoute path="/">
                                <div
                                    style={{
                                        minHeight: '100vh',
                                        background: Colors.LIGHT_GRAY5,
                                    }}
                                >
                                    <Switch>
                                        <Route path="/createProject">
                                            <Page
                                                name={PageName.CREATE_PROJECT}
                                            >
                                                <CreateProject />
                                            </Page>
                                        </Route>
                                        <Route path="/createProjectSettings/:projectUuid">
                                            <Page
                                                name={
                                                    PageName.CREATE_PROJECT_SETTINGS
                                                }
                                            >
                                                <CreateProjectSettings />
                                            </Page>
                                        </Route>
                                        <AppRoute path="/">
                                            <Switch>
                                                <Route path="/projects/:projectUuid/settings/:tab?">
                                                    <AppBar />
                                                    <Page
                                                        name={
                                                            PageName.PROJECT_SETTINGS
                                                        }
                                                    >
                                                        <ProjectSettings />
                                                    </Page>
                                                </Route>
                                                <Route path="/projects/:projectUuid/saved/:savedQueryUuid">
                                                    <AppBar />
                                                    <Page
                                                        name={
                                                            PageName.SAVED_QUERY_EXPLORER
                                                        }
                                                    >
                                                        <ExplorerProvider>
                                                            <SavedExplorer />
                                                        </ExplorerProvider>
                                                    </Page>
                                                </Route>
                                                <Route path="/projects/:projectUuid/saved">
                                                    <AppBar />
                                                    <Page
                                                        name={
                                                            PageName.SAVED_QUERIES
                                                        }
                                                    >
                                                        <SavedQueries />
                                                    </Page>
                                                </Route>
                                                <Route path="/projects/:projectUuid/dashboards/:dashboardUuid/:mode?">
                                                    <AppBar />
                                                    <Page
                                                        name={
                                                            PageName.DASHBOARD
                                                        }
                                                    >
                                                        <Dashboard />
                                                    </Page>
                                                </Route>
                                                <Route path="/projects/:projectUuid/dashboards">
                                                    <AppBar />
                                                    <Page
                                                        name={
                                                            PageName.SAVED_DASHBOARDS
                                                        }
                                                    >
                                                        <SavedDashboards />
                                                    </Page>
                                                </Route>
                                                <Route path="/projects/:projectUuid/sqlRunner">
                                                    <AppBar />
                                                    <Page
                                                        name={
                                                            PageName.SQL_RUNNER
                                                        }
                                                    >
                                                        <SqlRunner />
                                                    </Page>
                                                </Route>
                                                <Route path="/projects/:projectUuid/tables/:tableId">
                                                    <AppBar />
                                                    <Page
                                                        name={PageName.EXPLORER}
                                                    >
                                                        <ExplorerProvider>
                                                            <Explorer />
                                                        </ExplorerProvider>
                                                    </Page>
                                                </Route>
                                                <Route path="/projects/:projectUuid/tables">
                                                    <AppBar />
                                                    <Page
                                                        name={
                                                            PageName.EXPLORE_TABLES
                                                        }
                                                    >
                                                        <ExplorerProvider>
                                                            <Explorer />
                                                        </ExplorerProvider>
                                                    </Page>
                                                </Route>
                                                <Route path="/projects" exact>
                                                    <Projects />
                                                </Route>
                                                <Redirect to="/projects" />
                                            </Switch>
                                        </AppRoute>
                                    </Switch>
                                    <ReactQueryDevtools />
                                </div>
                            </PrivateRoute>
                        </Switch>
                    </Router>
                </TrackingProvider>
            </AppProvider>
        </HotkeysProvider>
    </QueryClientProvider>
);

export default App;
