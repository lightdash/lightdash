import React, { FC, useEffect } from 'react';
import { Button, Colors, Intent, Card, H2 } from '@blueprintjs/core';
import { useMutation } from 'react-query';
import { useForm } from 'react-hook-form';
import { Redirect, useLocation } from 'react-router-dom';
import {
    ApiError,
    LightdashMode,
    LightdashUser,
    SEED_EMAIL,
    SEED_PASSWORD,
} from 'common';
import { lightdashApi } from '../api';
import { useApp } from '../providers/AppProvider';
import AboutFooter from '../components/AboutFooter';
import PageSpinner from '../components/PageSpinner';
import { useTracking } from '../providers/TrackingProvider';
import Form from '../components/ReactHookForm/Form';
import Input from '../components/ReactHookForm/Input';
import PasswordInput from '../components/ReactHookForm/PasswordInput';

type LoginParams = { email: string; password: string };

const loginQuery = async (data: LoginParams) =>
    lightdashApi<LightdashUser>({
        url: `/login`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const Login: FC = () => {
    const location = useLocation<{ from?: Location } | undefined>();
    const { health, showToastError } = useApp();
    const methods = useForm<LoginParams>({
        mode: 'onSubmit',
    });
    const { identify } = useTracking();

    const { isLoading, mutate } = useMutation<
        LightdashUser,
        ApiError,
        LoginParams
    >(loginQuery, {
        mutationKey: ['login'],
        onSuccess: (data) => {
            identify({ id: data.userUuid });
            window.location.href = location.state?.from
                ? `${location.state.from.pathname}${location.state.from.search}`
                : '/';
        },
        onError: (error) => {
            showToastError({
                title: `Failed to login`,
                subtitle: error.error.message,
            });
        },
    });

    useEffect(() => {
        if (health.data?.mode === LightdashMode.DEMO) {
            methods.setValue('email', SEED_EMAIL.email);
            methods.setValue('password', SEED_PASSWORD.password);
        }
    }, [health, methods]);

    const handleLogin = (data: LoginParams) => {
        mutate(data);
    };

    if (health.isLoading) {
        return <PageSpinner />;
    }

    if (health.status === 'success' && health.data?.needsSetup) {
        return (
            <Redirect
                to={{
                    pathname: '/register',
                    state: { from: location.state?.from },
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
                    <H2 style={{ marginBottom: 25 }}>Login</H2>
                    <Form methods={methods} onSubmit={handleLogin}>
                        <Input
                            label="Email"
                            name="email"
                            placeholder="Email"
                            disabled={isLoading}
                            rules={{
                                required: 'Required field',
                            }}
                        />
                        <PasswordInput
                            label="Password"
                            name="password"
                            placeholder="Enter your password..."
                            disabled={isLoading}
                            rules={{
                                required: 'Required field',
                            }}
                        />
                        <Button
                            type="submit"
                            style={{ float: 'right', marginTop: 20 }}
                            intent={Intent.PRIMARY}
                            text="Login"
                            loading={isLoading}
                            data-cy="login-button"
                        />
                    </Form>
                </Card>
                <AboutFooter />
            </div>
        </div>
    );
};

export default Login;
