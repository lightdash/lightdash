import React, { useEffect } from 'react';
import { Card } from '@blueprintjs/core';
import { BrowserRouter as Router, Route, Switch } from 'react-router-dom';
import '@blueprintjs/core/lib/css/blueprint.css';
import '@blueprintjs/table/lib/css/table.css';
import '@blueprintjs/popover2/lib/css/blueprint-popover2.css';
import { ReactQueryDevtools } from 'react-query/devtools';
import { QueryClient, QueryClientProvider } from 'react-query';
import { Explorer } from './components/Explorer';
import './App.css';
import {
    ExploreConfigContext,
    useExploreConfig,
} from './hooks/useExploreConfig';
import { ExploreSideBar } from './components/ExploreSideBar';
import { AppToaster } from './components/AppToaster';
import { rudderAnalytics } from './components/Analytics';
import Login from './pages/login';
import PrivateRoute from './components/PrivateRoute';
import AppBar from './components/AppBar';
import { AppProvider } from './providers/AppProvider';
import Register from './pages/register';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            refetchOnWindowFocus: false,
        },
    },
});

const InnerApp = () => {
    const { error, setError } = useExploreConfig();

    useEffect(() => {
        if (error) {
            AppToaster.show(
                {
                    intent: 'danger',
                    message: (
                        <div>
                            <b>{error.title}</b>
                            <p>{error.text}</p>
                        </div>
                    ),
                    timeout: 0,
                    icon: 'error',
                },
                error.title,
            );
            setError(undefined);
        }
    }, [error, setError]);

    useEffect(() => {
        rudderAnalytics.page(undefined, 'Home');
    }, []);

    return (
        <div
            style={{
                minHeight: '100vh',
            }}
        >
            <AppBar />
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'row',
                    flexWrap: 'nowrap',
                    justifyContent: 'stretch',
                    alignItems: 'flex-start',
                }}
            >
                <Card
                    style={{
                        height: 'calc(100vh - 50px)',
                        width: '400px',
                        marginRight: '10px',
                        overflow: 'hidden',
                        position: 'sticky',
                        top: '50px',
                    }}
                    elevation={1}
                >
                    <ExploreSideBar />
                </Card>
                <div
                    style={{
                        padding: '10px 10px',
                        flexGrow: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'flex-start',
                        alignItems: 'stretch',
                    }}
                >
                    <Explorer />
                </div>
            </div>
            <ReactQueryDevtools />
        </div>
    );
};

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
                    <PrivateRoute path="/tables/:tableId">
                        <ExploreConfigContext>
                            <InnerApp />
                        </ExploreConfigContext>
                    </PrivateRoute>
                    <PrivateRoute path="/">
                        <ExploreConfigContext>
                            <InnerApp />
                        </ExploreConfigContext>
                    </PrivateRoute>
                </Switch>
            </Router>
        </AppProvider>
    </QueryClientProvider>
);

export default App;
