import React, {useEffect} from 'react';
import {Card, Colors} from '@blueprintjs/core';
import {BrowserRouter as Router, Route, Switch } from "react-router-dom";
import "@blueprintjs/core/lib/css/blueprint.css";
import "@blueprintjs/table/lib/css/table.css";
import "@blueprintjs/popover2/lib/css/blueprint-popover2.css";
import {Explorer} from "./components/Explorer";
import './App.css'
import {ExploreConfigContext, useExploreConfig} from "./hooks/useExploreConfig";
import {QueryClient, QueryClientProvider} from "react-query";
import {ExploreSideBar} from "./components/ExploreSideBar";
import {AppToaster} from "./components/AppToaster";

const queryClient = new QueryClient()

const App = () => {
    return (
        <Router>
                <Switch>
                    <Route path="/tables/:tableId">
                        <ExploreConfigContext>
                            <QueryClientProvider client={queryClient}>
                                <InnerApp />
                            </QueryClientProvider>
                        </ExploreConfigContext>
                    </Route>
                    <Route path="/">
                        <ExploreConfigContext>
                            <QueryClientProvider client={queryClient}>
                                <InnerApp />
                            </QueryClientProvider>
                        </ExploreConfigContext>
                    </Route>
                </Switch>
        </Router>
    )
}

const InnerApp = () => {
    const { error, setError } = useExploreConfig()

    useEffect(() => {
        if (error) {
            AppToaster.show({
                intent: 'danger',
                message:<div><b>{error.title}</b><p>{error.text}</p></div>,
                timeout: 0,
                icon: 'error',
            }, error.title)
            setError(undefined)
        }
    }, [error, setError])

    return (
          <div style={{
              minHeight: '100vh',
              display: "flex",
              flexDirection: "row",
              flexWrap: "nowrap",
              justifyContent: "stretch",
              alignItems: "flex-start",
              backgroundColor: Colors.LIGHT_GRAY5,
          }}>
              <Card style={{
                  height: '100vh',
                  width: '400px',
                  marginRight: '10px',
                  overflow: 'hidden',
              }} elevation={1}>
                  <ExploreSideBar />
              </Card>
              <div style={{
                  padding: '10px 10px',
                  flexGrow: 1,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-start",
                  alignItems: 'stretch'
              }}>
                  <Explorer />
              </div>
          </div>
  );
}

export default App;