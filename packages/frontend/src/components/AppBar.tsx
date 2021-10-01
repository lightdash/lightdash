import React, { useState } from 'react';
import {
    Alignment,
    Button,
    Classes,
    Navbar,
    NavbarDivider,
    NavbarGroup,
    NavbarHeading,
} from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import { useMutation } from 'react-query';
import { useParams } from 'react-router-dom';
import { lightdashApi } from '../api';
import { useApp } from '../providers/AppProvider';
import UserSettingsModal from './UserSettingsModal/UserSettingsModal';
import NavLink from './NavLink';
import { ErrorLogsDrawer } from './ErrorLogsDrawer';
import { ShowErrorsButton } from './ShowErrorsButton';

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
                    {projectUuid && (
                        <NavLink
                            to={`/projects/${projectUuid}/tables`}
                            style={{ marginRight: 10 }}
                        >
                            <Button minimal icon="database" text="Explore" />
                        </NavLink>
                    )}
                    {projectUuid && (
                        <NavLink to={`/projects/${projectUuid}/saved`}>
                            <Button minimal icon="saved" text="Saved charts" />
                        </NavLink>
                    )}
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
