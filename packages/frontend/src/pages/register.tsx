import React, { FC, useEffect } from 'react';
import { Colors, Card, H2 } from '@blueprintjs/core';
import { useMutation } from 'react-query';
import { ApiError, CreateInitialUserArgs, LightdashUser } from 'common';
import { Redirect, useLocation } from 'react-router-dom';
import { lightdashApi } from '../api';
import { useApp } from '../providers/AppProvider';
import AboutFooter from '../components/AboutFooter';
import PageSpinner from '../components/PageSpinner';
import CreateUserForm from '../components/CreateUserForm';

const registerQuery = async (data: CreateInitialUserArgs) =>
    lightdashApi<LightdashUser>({
        url: `/register`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const Register: FC = () => {
    const location = useLocation<{ from?: Location } | undefined>();
    const { health, showToastError } = useApp();
    const { rudder } = useApp();
    const { isLoading, mutate } = useMutation<
        LightdashUser,
        ApiError,
        CreateInitialUserArgs
    >(registerQuery, {
        mutationKey: ['login'],
        onSuccess: (data) => {
            rudder.identify({ id: data.userUuid, page: { name: 'register' } });
            window.location.href = location.state?.from
                ? `${location.state.from.pathname}${location.state.from.search}`
                : '/';
        },
        onError: (error) => {
            showToastError({
                title: `Failed to create user`,
                subtitle: error.error.message,
            });
        },
    });

    useEffect(() => {
        rudder.page({ name: 'register' });
    }, [rudder]);

    if (health.isLoading) {
        return <PageSpinner />;
    }

    if (health.status === 'success' && !health.data?.needsSetup) {
        return (
            <Redirect
                to={{
                    pathname: '/',
                }}
            />
        );
    }

    return (
        <div
            style={{
                height: '100vh',
                display: 'grid',
                justifyContent: 'center',
                background: Colors.LIGHT_GRAY4,
            }}
        >
            <div
                style={{
                    width: '400px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                }}
            >
                <Card
                    style={{
                        padding: 25,
                        display: 'flex',
                        flexDirection: 'column',
                    }}
                    elevation={2}
                >
                    <H2 style={{ marginBottom: 25 }}>Create account</H2>
                    <CreateUserForm
                        includeOrganizationName
                        isLoading={isLoading}
                        onCreate={(data: CreateInitialUserArgs) => {
                            mutate(data);
                        }}
                    />
                </Card>
                <AboutFooter />
            </div>
        </div>
    );
};

export default Register;
