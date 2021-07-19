import React, { useEffect } from 'react';
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

const logoutQuery = async () =>
    lightdashApi({
        url: `/logout`,
        method: 'GET',
        body: undefined,
    });

const AppBar = () => {
    const { user } = useApp();
    const { isLoading, status, mutate } = useMutation(logoutQuery, {
        mutationKey: ['logout'],
    });

    useEffect(() => {
        if (status === 'success') {
            window.location.href = '/login';
        }
    }, [status]);

    return (
        <>
            <Navbar style={{ position: 'sticky', top: 0 }}>
                <NavbarGroup align={Alignment.RIGHT}>
                    <NavbarHeading>
                        {user.data?.firstName} {user.data?.lastName}
                    </NavbarHeading>
                    <NavbarDivider />
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
        </>
    );
};

export default AppBar;
