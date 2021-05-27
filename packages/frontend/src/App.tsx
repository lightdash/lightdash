import React, {useEffect, useState} from 'react';
import {Callout, Card, Colors} from '@blueprintjs/core';
import {BrowserRouter as Router, Route, Switch, useHistory,} from "react-router-dom";
import {FilterGroup} from "common";
import "@blueprintjs/core/lib/css/blueprint.css";
import "@blueprintjs/table/lib/css/table.css";
import "@blueprintjs/popover2/lib/css/blueprint-popover2.css";
import {useColumns} from "./table";
import {Explorer} from "./Explorer";
import './App.css'
import {AppToaster} from "./AppToaster";
import {ExploreSideBar} from "./ExploreSideBar";
import {ExploreConfigContext} from "./hooks/useExploreConfig";
import {useExplores} from "./hooks/useExplores";
import {QueryClient, QueryClientProvider} from "react-query";

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
    // Any errors to display to the user
    const [errors, setErrors] = useState<{title: string, text: string} | undefined>()

    // Active filters applied to the table
    const [activeFilters, setActiveFilters] = useState<FilterGroup[]>([])

    // Column definitions for react-table
    const columns = useColumns()

    // The current data to display in the table
    const [isTableLoading, setIsTableLoading] = useState(false);
    const [tableData, setTableData] = useState<{[column: string]: any}[]>([]);

    const exploresResults = useExplores()

    useEffect(() => {
        if (exploresResults.isError) {
            const error = exploresResults.error
            const [first, ...rest] = error.error.message.split('\n')
            setErrors({title: first, text: rest.join('\n')})
        }

        if (exploresResults.isLoading) {
            AppToaster.show({message: 'Refreshing dbt... This could take a few minutes.', intent: "warning"})
        }
    }, [exploresResults])

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
                  { errors &&
                    <Callout style={{marginBottom: '20px'}} intent={'danger'} title={errors.title}>{ errors.text.split('\n').map((line, idx) => <p key={idx}>{line}</p>)}</Callout>
                  }
                  <Explorer
                      activeFilters={activeFilters}
                      onChangeActiveFilters={setActiveFilters}
                      columns={columns}
                      tableData={tableData}
                      isTableLoading={isTableLoading}
                      onChangeTableData={data => {setErrors(undefined); setTableData(data)}}
                      onChangeTableLoading={setIsTableLoading}
                      onError={setErrors}
                  />
              </div>
          </div>
  );
}

export default App;