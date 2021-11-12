import React from 'react';
import {
    BrowserRouter as Router,
    Redirect,
    Route,
    Switch,
} from 'react-router-dom';
import '@blueprintjs/core/lib/css/blueprint.css';
import '@blueprintjs/table/lib/css/table.css';
import '@blueprintjs/popover2/lib/css/blueprint-popover2.css';
import { ReactQueryDevtools } from 'react-query/devtools';
import { QueryClient, QueryClientProvider } from 'react-query';
import './App.css';
import { Colors, HotkeysProvider } from '@blueprintjs/core';
import Login from './pages/login';
import PrivateRoute from './components/PrivateRoute';
import AppBar from './components/AppBar';
import Register from './pages/register';
import { AppProvider } from './providers/AppProvider';
import SavedQueries from './pages/SavedQueries';
import Explorer from './pages/Explorer';
import { ExplorerProvider } from './providers/ExplorerProvider';
import SavedExplorer from './pages/SavedExplorer';
import Signup from './pages/Signup';
import { Page, TrackingProvider } from './providers/TrackingProvider';
import { PageName } from './types/Events';
import ProjectSettings from './pages/ProjectSettings';
import { Projects } from './pages/Projects';
import CreateProject from './pages/CreateProject';
import Welcome from './pages/Welcome';
import SavedDashboards from './pages/SavedDashboards';
import Dashboard from './pages/Dashboard';
import SqlRunner from './pages/SqlRunner';
import CreateProjectSettings from './pages/CreateProjectSettings';

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
                            <Route path="/createProject">
                                <Page name={PageName.CREATE_PROJECT}>
                                    <CreateProject />
                                </Page>
                            </Route>
                            <Route path="/createProjectSettings/:projectUuid">
                                <Page name={PageName.CREATE_PROJECT_SETTINGS}>
                                    <CreateProjectSettings />
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
                                        <Route path="/projects/:projectUuid/settings/:tab?">
                                            <AppBar />
                                            <Page
                                                name={PageName.PROJECT_SETTINGS}
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
                                            <Page name={PageName.SAVED_QUERIES}>
                                                <SavedQueries />
                                            </Page>
                                        </Route>
                                        <Route path="/projects/:projectUuid/dashboards/:dashboardUuid">
                                            <AppBar />
                                            <Page name={PageName.DASHBOARD}>
                                                <Dashboard />
                                            </Page>
                                        </Route>
                                        <Route path="/projects/:projectUuid/dashboards">
                                            <AppBar />
                                            <Page
                                                name={PageName.SAVED_DASHBOARDS}
                                            >
                                                <SavedDashboards />
                                            </Page>
                                        </Route>
                                        <Route path="/projects/:projectUuid/sqlRunner">
                                            <AppBar />
                                            <Page name={PageName.SQL_RUNNER}>
                                                <SqlRunner />
                                            </Page>
                                        </Route>
                                        <Route path="/projects/:projectUuid/tables/:tableId">
                                            <AppBar />
                                            <Page name={PageName.EXPLORER}>
                                                <ExplorerProvider>
                                                    <Explorer />
                                                </ExplorerProvider>
                                            </Page>
                                        </Route>
                                        <Route path="/projects/:projectUuid/tables">
                                            <AppBar />
                                            <Page
                                                name={PageName.EXPLORE_TABLES}
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
