import { ApiError, CreateUserArgs, LightdashUser } from '@lightdash/common';
import React, { FC } from 'react';
import { useMutation } from 'react-query';
import { useLocation } from 'react-router-dom';
import { lightdashApi } from '../api';
import {
    GoogleLoginButton,
    OktaLoginButton,
} from '../components/common/GoogleLoginButton';
import Page from '../components/common/Page/Page';
import CreateUserForm from '../components/CreateUserForm';
import PageSpinner from '../components/PageSpinner';
import useToaster from '../hooks/toaster/useToaster';
import { useApp } from '../providers/AppProvider';
import { useTracking } from '../providers/TrackingProvider';
import LightdashLogo from '../svgs/lightdash-black.svg';
import {
    CardWrapper,
    Divider,
    DividerWrapper,
    FooterCta,
    FormFooterCopy,
    FormWrapper,
    Logo,
    LogoWrapper,
    Title,
} from './SignUp.styles';

const registerQuery = async (data: CreateUserArgs) =>
    lightdashApi<LightdashUser>({
        url: `/register`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const Register: FC = () => {
    const location = useLocation<{ from?: Location } | undefined>();
    const { health } = useApp();
    const { showToastError } = useToaster();
    const allowPasswordAuthentication =
        !health.data?.auth.disablePasswordAuthentication;
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
        <CreateUserForm
            isLoading={isLoading}
            onSubmit={(data: CreateUserArgs) => {
                mutate(data);
            }}
        />
    );
    const logins = (
        <>
            {ssoLogins}
            {ssoLogins && passwordLogin && (
                <DividerWrapper>
                    <Divider />
                    <b>OR</b>
                    <Divider />
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
                    <Title>Create your account</Title>
                    {logins}
                </CardWrapper>
                <FormFooterCopy>
                    By creating an account, you agree to our{' '}
                    <FooterCta
                        href="https://www.lightdash.com/privacy-policy"
                        target="_blank"
                    >
                        Privacy Policy.
                    </FooterCta>
                </FormFooterCopy>
            </FormWrapper>
        </Page>
    );
};

export default Register;
