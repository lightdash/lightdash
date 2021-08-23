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
import Login from './pages/login';
import PrivateRoute from './components/PrivateRoute';
import AppBar from './components/AppBar';
import Register from './pages/register';
import { AppProvider } from './providers/AppProvider';
import Saved from './pages/Saved';
import Explorer from './pages/Explorer';
import { ExplorerProvider } from './providers/ExplorerProvider';
import SavedExplorer from './pages/SavedExplorer';
import Signup from './pages/Signup';
import { Page, TrackingProvider } from './providers/TrackingProvider';
import { PageName } from './types/Events';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            refetchOnWindowFocus: false,
        },
    },
});

const App = () => (
    <QueryClientProvider client={queryClient}>
        <AppProvider>
            <TrackingProvider>
                <Router>
                    <Switch>
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
                                }}
                            >
                                <AppBar />
                                <Switch>
                                    <Route path="/saved/:savedQueryUuid">
                                        <Page
                                            name={PageName.SAVED_QUERY_EXPLORER}
                                        >
                                            <ExplorerProvider>
                                                <SavedExplorer />
                                            </ExplorerProvider>
                                        </Page>
                                    </Route>
                                    <Route path="/saved">
                                        <Page name={PageName.SAVED_QUERIES}>
                                            <Saved />
                                        </Page>
                                    </Route>
                                    <Route path="/tables/:tableId">
                                        <Page name={PageName.EXPLORER}>
                                            <ExplorerProvider>
                                                <Explorer />
                                            </ExplorerProvider>
                                        </Page>
                                    </Route>
                                    <Route path="/tables">
                                        <Page name={PageName.EXPLORE_TABLES}>
                                            <ExplorerProvider>
                                                <Explorer />
                                            </ExplorerProvider>
                                        </Page>
                                    </Route>
                                    <Redirect to="/tables" />
                                </Switch>
                                <ReactQueryDevtools />
                            </div>
                        </PrivateRoute>
                    </Switch>
                </Router>
            </TrackingProvider>
        </AppProvider>
    </QueryClientProvider>
);

export default App;
