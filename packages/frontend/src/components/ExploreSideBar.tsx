import {
    Alert,
    Button,
    Divider,
    H3,
    Menu,
    MenuDivider,
    MenuItem,
    Text,
} from '@blueprintjs/core';
import React, { useState } from 'react';
import { friendlyName } from 'common';
import { useExploreConfig } from '../hooks/useExploreConfig';
import ExploreTree from './ExploreTree';
import { useTables } from '../hooks/useTables';
import { useTable } from '../hooks/useTable';
import { LineageButton } from './LineageButton';
import AboutFooter from './AboutFooter';

const SideBarLoadingState = () => (
    <Menu large style={{ flex: 1 }}>
        {[0, 1, 2, 3, 4].map((idx) => (
            <React.Fragment key={idx}>
                <MenuItem className="bp3-skeleton" text="Hello" />
                <MenuDivider />
            </React.Fragment>
        ))}
    </Menu>
);
const BasePanel = () => {
    const exploresResult = useTables();
    const [showChangeExploreConfirmation, setShowChangeExploreConfirmation] =
        useState(false);
    const [selectedExploreName, setSelectedExploreName] = useState('');
    const {
        activeTableName,
        setActiveTableName,
        activeFields,
        setSidebarPanel,
    } = useExploreConfig();

    const onCancelConfirmation = () => {
        setShowChangeExploreConfirmation(false);
        setSidebarPanel('explores');
    };

    const onSubmitConfirmation = () => {
        setShowChangeExploreConfirmation(false);
        setActiveTableName(selectedExploreName);
    };

    const confirm = (exploreName: string) => {
        setSelectedExploreName(exploreName);
        setShowChangeExploreConfirmation(true);
    };

    // TODO: render error
    if (exploresResult.isLoading) return <SideBarLoadingState />;
    return (
        <>
            <div style={{ height: '100px' }}>
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}
                >
                    <H3>Tables</H3>
                </div>
                <div style={{ padding: '10px' }}>
                    <Text>Select a table to start exploring your metrics</Text>
                </div>
                <Divider />
            </div>
            <Menu
                style={{
                    flex: '1',
                    overflow: 'auto',
                }}
            >
                {(exploresResult.data || []).map((explore) => (
                    <React.Fragment key={explore.name}>
                        <MenuItem
                            icon="database"
                            text={friendlyName(explore.name)}
                            onClick={() => {
                                if (
                                    activeFields.size > 0 &&
                                    activeTableName !== explore.name
                                )
                                    confirm(explore.name);
                                else {
                                    setActiveTableName(explore.name);
                                }
                            }}
                        />
                        <MenuDivider />
                    </React.Fragment>
                ))}
            </Menu>
            <Alert
                isOpen={showChangeExploreConfirmation}
                onCancel={onCancelConfirmation}
                onConfirm={() => onSubmitConfirmation()}
                intent="primary"
                cancelButtonText={`Go back to ${friendlyName(
                    activeTableName || '',
                )}`}
                confirmButtonText={`Explore ${friendlyName(
                    selectedExploreName || '',
                )}`}
            >
                <Text>
                    {`Start exploring ${friendlyName(
                        selectedExploreName || '',
                    )}? You will lose your current work on ${friendlyName(
                        activeTableName || '',
                    )}.`}
                </Text>
            </Alert>
        </>
    );
};
type ExplorePanelProps = {
    onBack: () => void;
};
const ExplorePanel = ({ onBack }: ExplorePanelProps) => {
    const { activeFields, toggleActiveField, setError } = useExploreConfig();
    const exploresResult = useTable();
    switch (exploresResult.status) {
        case 'idle': {
            onBack();
            return null;
        }
        case 'error': {
            onBack();
            const [title, ...lines] =
                exploresResult.error.error.message.split('\n');
            setError({ title, text: lines.join('\n') });
            return null;
        }
        case 'loading': {
            return <SideBarLoadingState />;
        }
        default:
            break;
    }
    // Success
    const activeExplore = exploresResult.data;
    const [databaseName, schemaName, tableName] = activeExplore.tables[
        activeExplore.baseTable
    ].sqlTable
        .replace(/["'`]/g, '')
        .split('.');
    return (
        <>
            <div
                style={{
                    paddingBottom: '10px',
                    display: 'flex',
                    flexDirection: 'row',
                    justifyContent: 'flex-start',
                    alignItems: 'center',
                }}
            >
                <Button onClick={onBack} icon="chevron-left" />
                <H3 style={{ marginBottom: 0, marginLeft: '10px' }}>
                    {friendlyName(activeExplore.name)}
                </H3>
            </div>
            <Divider />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <p style={{ paddingTop: 10 }}>
                    <b>Table</b>: {tableName}
                </p>
                <LineageButton />
            </div>
            <p>
                <b>Schema</b>: {schemaName}
            </p>
            <p>
                <b>Database</b>: {databaseName}
            </p>
            <p>
                <b>Description</b>:{' '}
                {activeExplore.tables[activeExplore.baseTable].description}
            </p>
            <div style={{ paddingBottom: '5px' }} />
            <Divider />
            <div style={{ paddingBottom: '10px' }} />
            <ExploreTree
                explore={activeExplore}
                selectedNodes={activeFields}
                onSelectedNodeChange={toggleActiveField}
            />
        </>
    );
};
export const ExploreSideBar = () => {
    const { sidebarPanel, setSidebarPanel } = useExploreConfig();
    const onBack = () => {
        setSidebarPanel('base');
    };

    return (
        <div
            style={{
                height: '100%',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            {sidebarPanel === 'base' && <BasePanel />}
            {sidebarPanel === 'explores' && <ExplorePanel onBack={onBack} />}
            <AboutFooter />
        </div>
    );
};
