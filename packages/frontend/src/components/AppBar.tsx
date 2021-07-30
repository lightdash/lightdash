import React, { useState } from 'react';
import {
    Alignment,
    Button,
    Navbar,
    NavbarDivider,
    NavbarGroup,
    NavbarHeading,
} from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import { useMutation } from 'react-query';
import { lightdashApi } from '../api';
import { useApp } from '../providers/AppProvider';
import UserSettingsModal from './UserSettingsModal/UserSettingsModal';
import NavLink from './NavLink';

const logoutQuery = async () =>
    lightdashApi({
        url: `/logout`,
        method: 'GET',
        body: undefined,
    });

const AppBar = () => {
    const { user } = useApp();
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const { isLoading, mutate } = useMutation(logoutQuery, {
        mutationKey: ['logout'],
        onSuccess: () => {
            window.location.href = '/login';
        },
    });

    return (
        <>
            <Navbar style={{ position: 'sticky', top: 0 }}>
                <NavbarGroup align={Alignment.LEFT}>
                    <NavbarHeading>{user.data?.organizationName}</NavbarHeading>
                    <NavbarDivider />
                    <NavLink to="/tables">
                        <Button minimal icon="database" text="Explore" />
                    </NavLink>
                    <NavLink to="/saved">
                        <Button minimal icon="saved" text="Saved" />
                    </NavLink>
                </NavbarGroup>
                <NavbarGroup align={Alignment.RIGHT}>
                    <NavbarHeading style={{ marginRight: 5 }}>
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
        </>
    );
};

export default AppBar;
