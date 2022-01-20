import { Card, H2 } from '@blueprintjs/core';
import { ApiError, CreateUserArgs, LightdashUser } from 'common';
import React, { FC } from 'react';
import { useMutation } from 'react-query';
import { Redirect, useLocation } from 'react-router-dom';
import { lightdashApi } from '../api';
import { GoogleLoginButton } from '../components/common/GoogleLoginButton';
import Page from '../components/common/Page/Page';
import CreateUserForm from '../components/CreateUserForm';
import PageSpinner from '../components/PageSpinner';
import { useApp } from '../providers/AppProvider';
import { useTracking } from '../providers/TrackingProvider';

const registerQuery = async (data: CreateUserArgs) =>
    lightdashApi<LightdashUser>({
        url: `/register`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const Register: FC = () => {
    const location = useLocation<{ from?: Location } | undefined>();
    const { health, showToastError } = useApp();
    const { identify } = useTracking();
    const { isLoading, mutate } = useMutation<
        LightdashUser,
        ApiError,
        CreateUserArgs
    >(registerQuery, {
        mutationKey: ['login'],
        onSuccess: (data) => {
            identify({ id: data.userUuid });
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
        <Page isFullHeight>
            <div
                style={{
                    width: '400px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    flex: 1,
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
                    {health.data?.auth.google.oauth2ClientId && (
                        <>
                            <GoogleLoginButton />
                            <span style={{ textAlign: 'center', margin: 15 }}>
                                <b>or</b>
                            </span>
                        </>
                    )}
                    <CreateUserForm
                        isLoading={isLoading}
                        onCreate={(data: CreateUserArgs) => {
                            mutate(data);
                        }}
                    />
                </Card>
            </div>
        </Page>
    );
};

export default Register;
