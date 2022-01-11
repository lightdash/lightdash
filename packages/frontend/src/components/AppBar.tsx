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
    Spinner,
} from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import React, { useState } from 'react';
import { useMutation } from 'react-query';
import { useParams } from 'react-router-dom';
import { lightdashApi } from '../api';
import { useDefaultProject } from '../hooks/useProjects';
import { useApp } from '../providers/AppProvider';
import { ReactComponent as Logo } from '../svgs/logo.svg';
import { UserAvatar } from './Avatar';
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
    const defaultProject = useDefaultProject();
    const params = useParams<{ projectUuid: string | undefined }>();
    const projectUuid = params.projectUuid || defaultProject.data?.projectUuid;
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const { mutate } = useMutation(logoutQuery, {
        mutationKey: ['logout'],
        onSuccess: () => {
            window.location.href = '/login';
        },
    });

    return (
        <>
            <Navbar
                style={{
                    position: 'sticky',
                    top: 0,
                }}
                className={Classes.DARK}
            >
                <NavbarGroup align={Alignment.LEFT}>
                    <NavLink
                        to="/home"
                        style={{ marginRight: 24, display: 'flex' }}
                    >
                        <Logo
                            title="Home"
                            style={{ marginTop: 2, height: 30, width: 90 }}
                        />
                    </NavLink>
                    <Popover2
                        interactionKind={PopoverInteractionKind.CLICK}
                        content={
                            !projectUuid ? (
                                <div style={{ padding: 10, minWidth: 90 }}>
                                    <Spinner size={20} />
                                </div>
                            ) : (
                                <Menu>
                                    <NavLink
                                        to={`/projects/${projectUuid}/tables`}
                                    >
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
                            )
                        }
                        position={Position.BOTTOM_LEFT}
                    >
                        <Button minimal icon="database" text="Explore" />
                    </Popover2>
                    <Popover2
                        interactionKind={PopoverInteractionKind.CLICK}
                        content={
                            !projectUuid ? (
                                <div style={{ padding: 10, minWidth: 90 }}>
                                    <Spinner size={20} />
                                </div>
                            ) : (
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
                            )
                        }
                        position={Position.BOTTOM_LEFT}
                    >
                        <Button minimal icon="search" text="Browse" />
                    </Popover2>
                    <Button
                        minimal
                        icon="cog"
                        text="Settings"
                        onClick={() => setIsSettingsOpen(true)}
                        data-cy="settings-button"
                    />
                </NavbarGroup>
                <NavbarGroup align={Alignment.RIGHT}>
                    <ShowErrorsButton
                        errorLogs={errorLogs}
                        setErrorLogsVisible={setErrorLogsVisible}
                    />
                    <NavbarHeading style={{ margin: 0, fontSize: 14 }}>
                        {user.data?.organizationName}
                    </NavbarHeading>
                    <NavbarDivider />
                    <Popover2
                        interactionKind={PopoverInteractionKind.CLICK}
                        content={
                            <Menu>
                                <MenuItem
                                    icon="log-out"
                                    text="Logout"
                                    onClick={() => mutate()}
                                />
                            </Menu>
                        }
                        position={Position.BOTTOM_LEFT}
                    >
                        <UserAvatar />
                    </Popover2>
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
