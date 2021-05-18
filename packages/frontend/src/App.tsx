import React, {useEffect, useState} from 'react';
import {
    Button,
    Callout, Card, Code,
    Colors, Divider, H3, Menu, MenuDivider,
    MenuItem,
    Text
} from '@blueprintjs/core';
import {Explore, fieldId, getDimensions, getMeasures, FilterGroup, friendlyName, getFields} from "common";
import "@blueprintjs/core/lib/css/blueprint.css";
import "@blueprintjs/table/lib/css/table.css";
import "@blueprintjs/popover2/lib/css/blueprint-popover2.css";
import {ItemRenderer, Select} from "@blueprintjs/select";
import {getExplores} from "./api";
import {buildColumns} from "./table";
import {Explorer} from "./Explorer";
import {SideTree} from "./SideTree";
import './App.css'
import Fuse from "fuse.js";
import {AppToaster} from "./AppToaster";

const ExploreSelect = Select.ofType<Explore>()
const exploreSelectRenderer: ItemRenderer<Explore> = (explore, {handleClick, modifiers }) => {
    if (!modifiers.matchesPredicate) {
        return null;
    }
    return (
        <MenuItem
            active={modifiers.active}
            key={explore.name}
            label={(explore.tables[explore.baseTable]?.description || '').substring(0, 30)}
            onClick={handleClick}
            text={friendlyName(explore.name)}
        />
    )
}

type ExploreSideBarProps = {
    explores: Explore[],
    isLoading: boolean,
    activeExplore: Explore | undefined,
    onSelectExplore: (explore: Explore | undefined) => void,
    activeColumnIds: Set<string>,
    onColumnSelect: (columnId: string) => void,
}
const ExploreSideBarProps = ({explores, isLoading, activeExplore, onSelectExplore, activeColumnIds, onColumnSelect}: ExploreSideBarProps) => {
    const BasePanel = () => {
        if (isLoading) {
            return <Menu large={true}>
                {[0, 1, 2, 3, 4].map(idx => (
                    <React.Fragment key={idx}>
                        <MenuItem
                            className='bp3-skeleton'
                            text={'Hello'}
                        />
                       <MenuDivider />
                    </React.Fragment>
                ))}
            </Menu>
            return <div><span>Loading...</span></div>
        }
        return (
            <div>
                <div style={{height: '100px'}}>
                    <div style={{display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                        <H3>Tables</H3>
                    </div>
                    <div style={{padding: '10px'}}>
                        <Text>
                            Select a table to start exploring your metrics
                        </Text>
                    </div>
                    <Divider />
                </div>
                <Menu >
                    {explores.map((explore, idx) => (
                        <React.Fragment key={idx}>
                            <MenuItem
                                icon={'database'}
                                text={friendlyName(explore.name)}
                                onClick={() => onSelectExplore(explore)}
                            />
                            <MenuDivider/>
                        </React.Fragment>
                    ))}
                </Menu>
            </div>
        )
    }
    const ExplorePanel = () => {
        if (!activeExplore)
            return null
        const fields = getFields(activeExplore)
        const fuse = new Fuse(fields, {keys: ['name', 'description']})
        return (
            <div style={{height: '100%', overflow: 'hidden'}}>
                <div style={{paddingBottom: '10px', display: 'flex', flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center'}}>
                    <Button onClick={() => onSelectExplore(undefined)} icon='chevron-left' />
                    <H3 style={{marginBottom: 0, marginLeft: '10px'}}>{friendlyName(activeExplore.name)}</H3>
                </div>
                <Code>
                    {activeExplore.tables[activeExplore.baseTable].sqlTable.replaceAll('`', '')}
                </Code>
                <div style={{paddingBottom: '10px'}}/>
                <Text>
                    {activeExplore.tables[activeExplore.baseTable].description}
                </Text>
                <div style={{paddingBottom: '10px'}}/>
                <Divider />
                <div style={{paddingBottom: '10px'}}/>
                <SideTree
                    fields={fields}
                    selectedNodes={activeColumnIds}
                    onSelectedNodeChange={onColumnSelect}
                    fuse={fuse}
                />
            </div>
        )
    }
    return <React.Fragment>
        {activeExplore ? <ExplorePanel /> : <BasePanel />}
    </React.Fragment>
}

const App = () => {
    // Any errors to display to the user
    const [errors, setErrors] = useState<{title: string, text: string} | undefined>()

    // All the explores available highest level state
    const [explores, setExplores] = useState<Explore[]>([])

    // The current explore can be changed
    const [activeExplore, setActiveExplore] = useState<Explore>()
    const [isExploresLoading, setIsExploresLoading] = useState(false)
    const measures = activeExplore ? getMeasures(activeExplore) : []
    const dimensions = activeExplore ? getDimensions(activeExplore) : []

    // The current active columns can be changed
    const [activeColumnIds, setActiveColumnIds] = useState<Set<string>>(new Set())

    // Active measures and dimensions are just the active columns
    const activeMeasures = measures.filter(m => activeColumnIds.has(fieldId(m)))
    const activeDimensions = dimensions.filter(d => activeColumnIds.has(fieldId(d)))

    // Active filters applied to the table
    const [activeFilters, setActiveFilters] = useState<FilterGroup[]>([])

    // Column definitions for react-table
    const columns = buildColumns(activeDimensions, activeMeasures)

    // The current data to display in the table
    const [isTableLoading, setIsTableLoading] = useState(false);
    const [tableData, setTableData] = useState<{[column: string]: any}[]>([]);


    const refreshExplores = async () => {
        setErrors(undefined)
        setIsExploresLoading(true)
        AppToaster.show({message: 'Refreshing dbt... This could take a few minutes.', intent: "warning"})
        getExplores(true)
            .then(explores => {
                if (explores.status === 'error') {
                    setExplores([])
                    setActiveExplore(undefined)
                    if (explores.error.name === 'ParseError') {
                        const [first, ...rest] = explores.error.message.split('\n')
                        setErrors({title: first, text: rest.join('\n')})
                    }
                    else
                        setErrors({title: 'Failed to compile dbt project', text: explores.error.data.message || explores.error.message})
                }
                else {
                    setExplores(explores.results)
                    const prevExplore = explores.results.find(e => e.name === activeExplore?.name)
                    setActiveExplore(prevExplore)
                }
                setIsExploresLoading(false)
            })
    }

    // on load
    useEffect(() => {
        setIsExploresLoading(true)
        setErrors(undefined)
        getExplores(false)
            .then(explores => {
                if (explores.status === 'error') {
                    setExplores([])
                    setActiveExplore(undefined)
                    if (explores.error.name === 'ParseError') {
                        const [first, ...rest] = explores.error.message.split('\n')
                        setErrors({title: first, text: rest.join('\n')})
                    }
                    else {
                        const [first, ...rest] = (explores.error.data.message || explores.error.message).split('\n')
                        setErrors({title: `Couldn't connect to dbt: ${first}`, text: rest.join('\n')})
                    }
                }
                else
                    setExplores(explores.results)
                setIsExploresLoading(false)
            })
    }, [])

    // Update available measures on explore change
    useEffect(() => {
        setActiveColumnIds(new Set())
    }, [activeExplore])


    const onColumnSelect = (columnId: string) => {
        setActiveColumnIds(currentIds => {
            const newIds = new Set(currentIds)
            if (currentIds.has(columnId)) {
                newIds.delete(columnId)
                return newIds
            }
            newIds.add(columnId)
            return newIds
        })
    }

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
                  <ExploreSideBarProps isLoading={isExploresLoading} explores={explores} activeExplore={activeExplore} onSelectExplore={setActiveExplore} activeColumnIds={activeColumnIds} onColumnSelect={onColumnSelect}/>
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
                      activeExplore={activeExplore}
                      activeDimensions={activeDimensions}
                      activeMeasures={activeMeasures}
                      activeFilters={activeFilters}
                      onChangeActiveFilters={setActiveFilters}
                      columns={columns}
                      tableData={tableData}
                      isTableLoading={isTableLoading}
                      onChangeTableData={data => {setErrors(undefined); setTableData(data)}}
                      onChangeTableLoading={setIsTableLoading}
                      onError={setErrors}
                      isExploresRefreshing={isExploresLoading}
                      onRefreshExplores={refreshExplores}
                  />
              </div>
          </div>
  );
}

export default App;