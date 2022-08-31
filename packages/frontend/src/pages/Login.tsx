import { Intent } from '@blueprintjs/core';
import {
    ApiError,
    LightdashMode,
    LightdashUser,
    SEED_ORG_1_ADMIN_EMAIL,
    SEED_ORG_1_ADMIN_PASSWORD,
} from '@lightdash/common';
import React, { FC, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation } from 'react-query';
import { Redirect, useLocation } from 'react-router-dom';
import { lightdashApi } from '../api';
import AnchorLink from '../components/common/AnchorLink/index';
import {
    GoogleLoginButton,
    OktaLoginButton,
} from '../components/common/GoogleLoginButton';
import Page from '../components/common/Page/Page';
import PageSpinner from '../components/PageSpinner';
import Form from '../components/ReactHookForm/Form';
import useToaster from '../hooks/toaster/useToaster';
import { useApp } from '../providers/AppProvider';
import { useTracking } from '../providers/TrackingProvider';
import LightdashLogo from '../svgs/lightdash-black.svg';
import {
    AnchorLinkWrapper,
    CardWrapper,
    Divider,
    DividerWrapper,
    FormWrapper,
    InputField,
    Logo,
    LogoWrapper,
    PasswordInputField,
    SubmitButton,
    Title,
} from './SignUp.styles';

type LoginParams = { email: string; password: string };

const loginQuery = async (data: LoginParams) =>
    lightdashApi<LightdashUser>({
        url: `/login`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const Login: FC = () => {
    const location = useLocation<{ from?: Location } | undefined>();
    const { health } = useApp();
    const { showToastError } = useToaster();
    const methods = useForm<LoginParams>({
        mode: 'onSubmit',
    });
    const { identify } = useTracking();

    const { isIdle, isLoading, mutate } = useMutation<
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

    const allowPasswordAuthentication =
        !health.data?.auth.disablePasswordAuthentication;

    const isDemo = health.data?.mode === LightdashMode.DEMO;
    useEffect(() => {
        if (isDemo && isIdle) {
            mutate({
                email: SEED_ORG_1_ADMIN_EMAIL.email,
                password: SEED_ORG_1_ADMIN_PASSWORD.password,
            });
        }
    }, [isDemo, mutate, isIdle]);

    const handleLogin = (data: LoginParams) => {
        mutate(data);
    };

    if (health.isLoading || isDemo) {
        return <PageSpinner />;
    }
    if (health.status === 'success' && health.data?.requiresOrgRegistration) {
        return (
            <Redirect
                to={{
                    pathname: '/register',
                    state: { from: location.state?.from },
                }}
            />
        );
    }

    if (health.status === 'success' && health.data?.isAuthenticated) {
        return <Redirect to={{ pathname: '/' }} />;
    }

    const ssoAvailable =
        !!health.data?.auth.google.oauth2ClientId ||
        health.data?.auth.okta.enabled;
    const ssoLogins = ssoAvailable && (
        <>
            {health.data?.auth.google.oauth2ClientId && <GoogleLoginButton />}
            {health.data?.auth.okta.enabled && <OktaLoginButton />}
        </>
    );
    const passwordLogin = allowPasswordAuthentication && (
        <Form name="login" methods={methods} onSubmit={handleLogin}>
            <InputField
                label="Email address"
                name="email"
                placeholder="d.attenborough@greenplanet.com"
                disabled={isLoading}
                rules={{
                    required: 'Required field',
                }}
            />
            <PasswordInputField
                label="Password"
                name="password"
                placeholder="Enter a password"
                disabled={isLoading}
                rules={{
                    required: 'Required field',
                }}
            />
            <SubmitButton
                type="submit"
                intent={Intent.PRIMARY}
                text="Sign in"
                loading={isLoading}
                data-cy="login-button"
            />
            <AnchorLinkWrapper>
                <AnchorLink href="/recover-password">
                    Forgot your password ?
                </AnchorLink>
            </AnchorLinkWrapper>
        </Form>
    );

    const logins = (
        <>
            {ssoLogins}
            {ssoLogins && passwordLogin && (
                <DividerWrapper>
                    <Divider></Divider>
                    <b>OR</b>
                    <Divider></Divider>
                </DividerWrapper>
            )}
            {passwordLogin}
        </>
    );

    return (
        <Page isFullHeight>
            <FormWrapper>
                <LogoWrapper>
                    <Logo src={LightdashLogo} alt="lightdash logo" />
                </LogoWrapper>
                <CardWrapper elevation={2}>
                    <Title>Sign in</Title>
                    {logins}
                </CardWrapper>
            </FormWrapper>
        </Page>
    );
};

export default Login;
