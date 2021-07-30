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
            <Router>
                <Switch>
                    <Route path="/register">
                        <Register />
                    </Route>
                    <Route path="/login">
                        <Login />
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
                                    <ExplorerProvider>
                                        <SavedExplorer />
                                    </ExplorerProvider>
                                </Route>
                                <Route path="/saved">
                                    <Saved />
                                </Route>
                                <Route path="/tables/:tableId">
                                    <ExplorerProvider>
                                        <Explorer />
                                    </ExplorerProvider>
                                </Route>
                                <Route path="/tables">
                                    <ExplorerProvider>
                                        <Explorer />
                                    </ExplorerProvider>
                                </Route>
                                <Redirect to="/tables" />
                            </Switch>
                            <ReactQueryDevtools />
                        </div>
                    </PrivateRoute>
                </Switch>
            </Router>
        </AppProvider>
    </QueryClientProvider>
);

export default App;
