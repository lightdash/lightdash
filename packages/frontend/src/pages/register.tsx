import React, { FC, useState, useEffect } from 'react';
import {
    Button,
    Colors,
    FormGroup,
    InputGroup,
    Intent,
    Card,
    H2,
    Switch,
} from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import { useMutation } from 'react-query';
import { ApiError, CreateInitialUserArgs, validateEmail } from 'common';
import { Redirect } from 'react-router-dom';
import { lightdashApi } from '../api';
import { AppToaster } from '../components/AppToaster';
import { useApp } from '../providers/AppProvider';
import AboutFooter from '../components/AboutFooter';
import PageSpinner from '../components/PageSpinner';

const registerQuery = async (data: CreateInitialUserArgs) =>
    lightdashApi<undefined>({
        url: `/register`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const Register: FC = () => {
    const { health } = useApp();
    const [firstName, setFirstName] = useState<string>();
    const [lastName, setLastName] = useState<string>();
    const [organizationName, setOrganizationName] = useState<string>();
    const [email, setEmail] = useState<string>();
    const [password, setPassword] = useState<string>();
    const [showPassword, setShowPassword] = useState<boolean>(false);
    const [isMarketingOptedIn, setIsMarketingOptedIn] = useState<boolean>(true);

    const { isLoading, status, error, mutate } = useMutation<
        undefined,
        ApiError,
        CreateInitialUserArgs
    >(registerQuery, { mutationKey: ['login'] });

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
            window.location.href = '/login';
        }
    }, [status]);

    const handleLogin = () => {
        if (
            firstName &&
            lastName &&
            organizationName &&
            email &&
            password &&
            validateEmail(email)
        ) {
            mutate({
                firstName,
                lastName,
                organizationName,
                email,
                password,
                isMarketingOptedIn,
                isTrackingAnonymized: true,
            });
        } else {
            const message =
                email && !validateEmail(email)
                    ? 'Invalid email'
                    : 'Required fields: first name, last name, organization name, email and password';
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
                    <FormGroup
                        label="First name"
                        labelFor="first-name-input"
                        labelInfo="(required)"
                    >
                        <InputGroup
                            id="first-name-input"
                            placeholder="Jane"
                            type="text"
                            required
                            disabled={isLoading}
                            onChange={(e) => setFirstName(e.target.value)}
                        />
                    </FormGroup>
                    <FormGroup
                        label="Last name"
                        labelFor="last-name-input"
                        labelInfo="(required)"
                    >
                        <InputGroup
                            id="last-name-input"
                            placeholder="Doe"
                            type="text"
                            required
                            disabled={isLoading}
                            onChange={(e) => setLastName(e.target.value)}
                        />
                    </FormGroup>
                    <FormGroup
                        label="Organization name"
                        labelFor="organization-name-input"
                        labelInfo="(required)"
                    >
                        <InputGroup
                            id="organization-name-input"
                            placeholder="Lightdash"
                            type="text"
                            required
                            disabled={isLoading}
                            onChange={(e) =>
                                setOrganizationName(e.target.value)
                            }
                        />
                    </FormGroup>
                    <FormGroup
                        label="Email"
                        labelFor="email-input"
                        labelInfo="(required)"
                    >
                        <InputGroup
                            id="email-input"
                            placeholder="Email"
                            type="email"
                            required
                            disabled={isLoading}
                            value={email}
                            onChange={(e) => setEmail(e.target.value.trim())}
                        />
                    </FormGroup>
                    <FormGroup
                        label="Password"
                        labelFor="password-input"
                        labelInfo="(required)"
                    >
                        <InputGroup
                            id="password-input"
                            placeholder="Enter your password..."
                            type={showPassword ? 'text' : 'password'}
                            required
                            disabled={isLoading}
                            value={password}
                            onChange={(e) => setPassword(e.target.value.trim())}
                            rightElement={
                                <Tooltip2
                                    content={`${
                                        showPassword ? 'Hide' : 'Show'
                                    } Password`}
                                    disabled={isLoading}
                                >
                                    <Button
                                        minimal
                                        disabled={isLoading}
                                        icon={
                                            showPassword
                                                ? 'eye-off'
                                                : 'eye-open'
                                        }
                                        intent={Intent.WARNING}
                                        onClick={() =>
                                            setShowPassword(
                                                (prevState) => !prevState,
                                            )
                                        }
                                    />
                                </Tooltip2>
                            }
                        />
                    </FormGroup>
                    <Switch
                        style={{ marginTop: '20px' }}
                        defaultChecked
                        disabled={isLoading}
                        label="Keep me updated on new Lightdash features"
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setIsMarketingOptedIn(e.target.checked)
                        }
                    />
                    <Button
                        style={{ alignSelf: 'flex-end', marginTop: 20 }}
                        intent={Intent.PRIMARY}
                        text="Create"
                        onClick={handleLogin}
                        loading={isLoading}
                    />
                </Card>
                <AboutFooter />
            </div>
        </div>
    );
};

export default Register;
