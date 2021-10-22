import React, { FC, useState, useEffect } from 'react';
import {
    Button,
    Colors,
    FormGroup,
    InputGroup,
    Intent,
    Card,
    H2,
} from '@blueprintjs/core';
import { useMutation } from 'react-query';
import { Redirect, useLocation } from 'react-router-dom';
import { ApiError, LightdashMode, LightdashUser, USER_SEED } from 'common';
import { lightdashApi } from '../api';
import { AppToaster } from '../components/AppToaster';
import { useApp } from '../providers/AppProvider';
import AboutFooter from '../components/AboutFooter';
import PageSpinner from '../components/PageSpinner';
import PasswordInput from '../components/PasswordInput';
import { useTracking } from '../providers/TrackingProvider';

const loginQuery = async (data: { email: string; password: string }) =>
    lightdashApi<LightdashUser>({
        url: `/login`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const Login: FC = () => {
    const location = useLocation<{ from?: Location } | undefined>();
    const { health } = useApp();
    const [email, setEmail] = useState<string>();
    const [password, setPassword] = useState<string>();
    const { identify } = useTracking();

    const { isLoading, status, error, mutate } = useMutation<
        LightdashUser,
        ApiError,
        { email: string; password: string }
    >(loginQuery, {
        mutationKey: ['login'],
        onSuccess: (data) => identify({ id: data.userUuid }),
    });

    useEffect(() => {
        if (error) {
            const [first, ...rest] = error.error.message.split('\n');
            AppToaster.show(
                {
                    intent: 'danger',
                    message: (
                        <div>
                            <b>{first}</b>
                            <p>{rest.join('\n')}</p>
                        </div>
                    ),
                    timeout: 0,
                    icon: 'error',
                },
                first,
            );
        }
    }, [error]);

    useEffect(() => {
        if (status === 'success') {
            window.location.href = location.state?.from
                ? `${location.state.from.pathname}${location.state.from.search}`
                : '/';
        }
    }, [status, location]);

    useEffect(() => {
        if (health.data?.mode === LightdashMode.DEMO) {
            setEmail(USER_SEED.email);
            setPassword(USER_SEED.password);
        }
    }, [health]);

    const handleLogin = () => {
        if (email && password) {
            mutate({ email, password });
        } else {
            const message = 'Required fields: email and password';
            AppToaster.show(
                {
                    intent: 'danger',
                    message: (
                        <div>
                            <b>{message}</b>
                        </div>
                    ),
                    timeout: 3000,
                    icon: 'error',
                },
                message,
            );
        }
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
                    <form>
                        <FormGroup label="Email" labelFor="email-input">
                            <InputGroup
                                id="email-input"
                                placeholder="Email"
                                type="email"
                                required
                                disabled={isLoading}
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                data-cy="email"
                            />
                        </FormGroup>
                        <PasswordInput
                            label="Password"
                            placeholder="Enter your password..."
                            required
                            disabled={isLoading}
                            value={password}
                            onChange={setPassword}
                            data-cy="password"
                        />
                        <Button
                            type="submit"
                            style={{ float: 'right', marginTop: 20 }}
                            intent={Intent.PRIMARY}
                            text="Login"
                            onClick={handleLogin}
                            loading={isLoading}
                            data-cy="login-button"
                        />
                    </form>
                </Card>
                <AboutFooter />
            </div>
        </div>
    );
};

export default Login;
