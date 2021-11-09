import {
    Alignment,
    Button,
    Classes,
    Menu,
    MenuItem,
    Navbar,
    NavbarDivider,
    NavbarGroup,
    NavbarHeading,
    PopoverInteractionKind,
    Position,
} from '@blueprintjs/core';
import { Popover2, Tooltip2 } from '@blueprintjs/popover2';
import React, { useState } from 'react';
import { useMutation } from 'react-query';
import { useParams } from 'react-router-dom';
import { lightdashApi } from '../api';
import { useApp } from '../providers/AppProvider';
import { ErrorLogsDrawer } from './ErrorLogsDrawer';
import NavLink from './NavLink';
import { ShowErrorsButton } from './ShowErrorsButton';
import UserSettingsModal from './UserSettingsModal/UserSettingsModal';

const logoutQuery = async () =>
    lightdashApi({
        url: `/logout`,
        method: 'GET',
        body: undefined,
    });

const AppBar = () => {
    const {
        user,
        errorLogs: { errorLogs, setErrorLogsVisible },
    } = useApp();
    const { projectUuid } = useParams<{ projectUuid: string | undefined }>();
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const { isLoading, mutate } = useMutation(logoutQuery, {
        mutationKey: ['logout'],
        onSuccess: () => {
            window.location.href = '/login';
        },
    });

    return (
        <>
            <Navbar
                style={{ position: 'sticky', top: 0 }}
                className={Classes.DARK}
            >
                <NavbarGroup align={Alignment.LEFT}>
                    <NavbarHeading>{user.data?.organizationName}</NavbarHeading>
                    <NavbarDivider />
                    <Popover2
                        interactionKind={PopoverInteractionKind.CLICK}
                        content={
                            <Menu>
                                <NavLink to={`/projects/${projectUuid}/tables`}>
                                    <MenuItem
                                        role="button"
                                        icon="th"
                                        text="Tables"
                                        style={{ marginBottom: 5 }}
                                    />
                                </NavLink>
                                <NavLink
                                    to={`/projects/${projectUuid}/sqlRunner`}
                                >
                                    <MenuItem
                                        role="button"
                                        icon="console"
                                        text="SQL Runner"
                                    />
                                </NavLink>
                            </Menu>
                        }
                        position={Position.BOTTOM_LEFT}
                    >
                        <Button minimal icon="database" text="Explore" />
                    </Popover2>
                    <Popover2
                        interactionKind={PopoverInteractionKind.CLICK}
                        content={
                            <Menu>
                                <NavLink
                                    to={`/projects/${projectUuid}/dashboards`}
                                >
                                    <MenuItem
                                        role="button"
                                        text="Dashboards"
                                        icon="control"
                                        style={{ marginBottom: 5 }}
                                    />
                                </NavLink>
                                <NavLink
                                    to={`/projects/${projectUuid}/saved`}
                                    style={{ marginBottom: 5 }}
                                >
                                    <MenuItem
                                        icon="chart"
                                        text="Saved charts"
                                    />
                                </NavLink>
                            </Menu>
                        }
                        position={Position.BOTTOM_LEFT}
                    >
                        <Button minimal icon="search" text="Browse" />
                    </Popover2>
                </NavbarGroup>
                <NavbarGroup align={Alignment.RIGHT}>
                    <ShowErrorsButton
                        errorLogs={errorLogs}
                        setErrorLogsVisible={setErrorLogsVisible}
                    />
                    <NavbarHeading
                        style={{ marginRight: 5 }}
                        data-cy="heading-username"
                    >
                        {user.data?.firstName} {user.data?.lastName}
                    </NavbarHeading>
                    <NavbarDivider />
                    <Tooltip2 content="Settings">
                        <Button
                            icon="cog"
                            minimal
                            intent="none"
                            loading={isLoading}
                            onClick={() => setIsSettingsOpen(true)}
                            data-cy="settings-button"
                        />
                    </Tooltip2>
                    <Tooltip2 content="Logout">
                        <Button
                            icon="log-out"
                            minimal
                            intent="danger"
                            loading={isLoading}
                            onClick={() => mutate()}
                        />
                    </Tooltip2>
                </NavbarGroup>
            </Navbar>
            <UserSettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
            />
            <ErrorLogsDrawer />
        </>
    );
};

export default AppBar;
