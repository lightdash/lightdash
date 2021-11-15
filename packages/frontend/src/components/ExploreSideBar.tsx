import {
    Alert,
    Button,
    Divider,
    H3,
    Menu,
    MenuDivider,
    MenuItem,
    NonIdealState,
    Text,
} from '@blueprintjs/core';
import { friendlyName } from 'common';
import React, { useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { useExplore } from '../hooks/useExplore';
import { useExplores } from '../hooks/useExplores';
import { useApp } from '../providers/AppProvider';
import { useExplorer } from '../providers/ExplorerProvider';
import { Section } from '../providers/TrackingProvider';
import { SectionName } from '../types/Events';
import AboutFooter from './AboutFooter';
import { ExploreMenuItem } from './ExploreMenuItem';
import ExploreTree from './ExploreTree';
import { LineageButton } from './LineageButton';
import { ShowErrorsButton } from './ShowErrorsButton';

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
    const history = useHistory();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const exploresResult = useExplores(true);
    const [showChangeExploreConfirmation, setShowChangeExploreConfirmation] =
        useState(false);
    const [selectedExploreName, setSelectedExploreName] = useState('');
    const {
        state: { tableName: activeTableName, activeFields },
        actions: { setTableName: setActiveTableName },
    } = useExplorer();
    const { errorLogs } = useApp();

    const onCancelConfirmation = () => {
        setShowChangeExploreConfirmation(false);
    };

    const onSubmitConfirmation = () => {
        setShowChangeExploreConfirmation(false);
        setActiveTableName(selectedExploreName);
    };

    const confirm = (exploreName: string) => {
        setSelectedExploreName(exploreName);
        setShowChangeExploreConfirmation(true);
    };

    if (exploresResult.data) {
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
                        <Text>
                            Select a table to start exploring your metrics
                        </Text>
                    </div>
                    <Divider />
                </div>
                <Menu
                    style={{
                        flex: '1',
                        overflow: 'auto',
                    }}
                >
                    {(exploresResult.data || [])
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((explore) => (
                            <React.Fragment key={explore.name}>
                                <ExploreMenuItem
                                    explore={explore}
                                    onClick={() => {
                                        if (
                                            activeFields.size > 0 &&
                                            activeTableName !== explore.name
                                        )
                                            confirm(explore.name);
                                        else {
                                            history.push(
                                                `/projects/${projectUuid}/tables/${explore.name}`,
                                            );
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
    }
    if (exploresResult.status === 'loading') {
        return <SideBarLoadingState />;
    }
    if (exploresResult.status === 'error') {
        return (
            <NonIdealState
                icon="error"
                title="Could not load explores"
                description="Check error logs for more details"
                action={
                    <ShowErrorsButton
                        errorLogs={errorLogs.errorLogs}
                        setErrorLogsVisible={errorLogs.setErrorLogsVisible}
                    />
                }
            />
        );
    }
    return (
        <NonIdealState icon="warning-sign" title="Could not load explores" />
    );
};
type ExplorePanelProps = {
    onBack: () => void;
};
export const ExplorePanel = ({ onBack }: ExplorePanelProps) => {
    const {
        state: { activeFields, tableName: activeTableName },
        actions: { toggleActiveField },
    } = useExplorer();
    const exploresResult = useExplore(activeTableName);
    if (exploresResult.data) {
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
                <div
                    style={{ display: 'flex', justifyContent: 'space-between' }}
                >
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
                    onSelectedFieldChange={toggleActiveField}
                />
            </>
        );
    }
    if (exploresResult.status === 'error') {
        onBack();
        return null;
    }
    if (exploresResult.status === 'loading') {
        return <SideBarLoadingState />;
    }
    return <span>Cannot load explore</span>;
};
export const ExploreSideBar = () => {
    const {
        state: { tableName },
        actions: { reset },
    } = useExplorer();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const history = useHistory();
    const onBack = () => {
        reset();
        history.push({
            pathname: `/projects/${projectUuid}/tables`,
        });
    };

    return (
        <Section name={SectionName.SIDEBAR}>
            <div
                style={{
                    height: '100%',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                {!tableName ? <BasePanel /> : <ExplorePanel onBack={onBack} />}
                <AboutFooter />
            </div>
        </Section>
    );
};
