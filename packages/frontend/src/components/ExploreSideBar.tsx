import {Alert, Button, Code, Divider, H3, Menu, MenuDivider, MenuItem, Text} from "@blueprintjs/core";
import React, {useState} from "react";
import {useExplores} from "../hooks/useExplores";
import {useExploreConfig} from "../hooks/useExploreConfig";
import {friendlyName, getFields} from "common";
import Fuse from "fuse.js";
import {SideTree} from "./SideTree";

const SideBarLoadingState = () => (
    <Menu large={true}>
        {[0, 1, 2, 3, 4].map(idx => (
            <React.Fragment key={idx}>
                <MenuItem
                    className='bp3-skeleton'
                    text={'Hello'}
                />
                <MenuDivider/>
            </React.Fragment>
        ))}
    </Menu>
)
const BasePanel = () => {
    const exploresResult = useExplores()
    const [showChangeExploreConfirmation, setShowChangeExploreConfirmation] = useState(false)
    const [selectedExploreName, setSelectedExploreName] = useState('')
    const {activeTableName, setActiveTableName, activeFields, setSidebarPanel} = useExploreConfig()

    const onCancelConfirmation = () => {
        setShowChangeExploreConfirmation(false)
        setSidebarPanel('explores')
    }

    const onSubmitConfirmation = () => {
        setShowChangeExploreConfirmation(false)
        setActiveTableName(selectedExploreName)
    }

    const confirm = (exploreName: string) => {
        setSelectedExploreName(exploreName)
        setShowChangeExploreConfirmation(true)
    }

    // TODO: render error
    if (exploresResult.isLoading)
        return <SideBarLoadingState/>
    return (
        <div>
            <div style={{height: '100px'}}>
                <div style={{
                    display: 'flex',
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <H3>Tables</H3>
                </div>
                <div style={{padding: '10px'}}>
                    <Text>
                        Select a table to start exploring your metrics
                    </Text>
                </div>
                <Divider/>
            </div>
            <Menu>
                {(exploresResult.data || []).map((explore, idx) => (
                    <React.Fragment key={idx}>
                        <MenuItem
                            icon={'database'}
                            text={friendlyName(explore.name)}
                            onClick={() => {
                                if ((activeFields.size > 0) && (activeTableName !== explore.name))
                                    confirm(explore.name)
                                else {
                                    setActiveTableName(explore.name)
                                }
                            }}
                        />
                        <MenuDivider/>
                    </React.Fragment>
                ))}
            </Menu>
            <Alert
                isOpen={showChangeExploreConfirmation}
                onCancel={onCancelConfirmation}
                onConfirm={() => onSubmitConfirmation()}
                intent={'primary'}
                cancelButtonText={`Go back to ${friendlyName(activeTableName || '')}`}
                confirmButtonText={`Explore ${friendlyName(selectedExploreName || '')}`}
            >
                <Text>
                    {`Start exploring ${friendlyName(selectedExploreName || '')}? You will lose your current work on ${friendlyName(activeTableName || '')}.`}
                </Text>
            </Alert>
        </div>
    )
}
type ExplorePanelProps = {
    onBack: () => void,
}
const ExplorePanel = ({onBack}: ExplorePanelProps) => {
    const exploresResult = useExplores()
    const {activeTableName, activeFields, toggleActiveField} = useExploreConfig()
    const activeExplore = (exploresResult.data || []).find(e => e.name === activeTableName)
    if (exploresResult.isLoading) {
        return <SideBarLoadingState/>
    }
    if (activeExplore === undefined) {
        onBack()
        return <div/>
    }
    const fields = getFields(activeExplore)
    const fuse = new Fuse(fields, {keys: ['name', 'description']})
    return (
        <div style={{height: '100%', overflow: 'hidden'}}>
            <div style={{
                paddingBottom: '10px',
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'flex-start',
                alignItems: 'center'
            }}>
                <Button onClick={onBack} icon='chevron-left'/>
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
            <Divider/>
            <div style={{paddingBottom: '10px'}}/>
            <SideTree
                fields={fields}
                selectedNodes={activeFields}
                onSelectedNodeChange={toggleActiveField}
                fuse={fuse}
            />
        </div>
    )
}
export const ExploreSideBar = () => {
    const {sidebarPanel, setSidebarPanel} = useExploreConfig()
    const onBack = () => {
        setSidebarPanel('base')
    }

    switch (sidebarPanel) {
        case "base":
            return <BasePanel />
        case "explores":
            return <ExplorePanel onBack={onBack}/>
    }
}