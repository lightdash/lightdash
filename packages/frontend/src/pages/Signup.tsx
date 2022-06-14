import { NonIdealState } from '@blueprintjs/core';
import {
    ApiError,
    CreateOrganizationUser,
    CreateUserArgs,
    LightdashUser,
} from '@lightdash/common';
import React, { FC } from 'react';
import { useMutation } from 'react-query';
import { Redirect, useParams } from 'react-router-dom';
import { lightdashApi } from '../api';
import { GoogleLoginButton } from '../components/common/GoogleLoginButton';
import Page from '../components/common/Page/Page';
import CreateUserForm from '../components/CreateUserForm';
import PageSpinner from '../components/PageSpinner';
import { useInviteLink } from '../hooks/useInviteLink';
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

const createUserQuery = async (data: CreateOrganizationUser) =>
    lightdashApi<LightdashUser>({
        url: `/user`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const Signup: FC = () => {
    const { inviteCode } = useParams<{ inviteCode: string }>();
    const { health } = useApp();
    const { showToastError } = useApp();
    const { identify } = useTracking();
    const { isLoading, mutate } = useMutation<
        LightdashUser,
        ApiError,
        CreateOrganizationUser
    >(createUserQuery, {
        mutationKey: ['create_user'],
        onSuccess: (data) => {
            identify({ id: data.userUuid });
            window.location.href = '/';
        },
        onError: (error) => {
            showToastError({
                title: `Failed to create user`,
                subtitle: error.error.message,
            });
        },
    });
    const inviteLinkQuery = useInviteLink(inviteCode);

    const allowPasswordAuthentication =
        !health.data?.auth.disablePasswordAuthentication;

    if (health.isLoading || inviteLinkQuery.isLoading) {
        return <PageSpinner />;
    }

    if (health.status === 'success' && health.data?.isAuthenticated) {
        return <Redirect to={{ pathname: '/' }} />;
    }

    return (
        <Page isFullHeight>
            <FormWrapper>
                <LogoWrapper>
                    <Logo src={LightdashLogo} alt="lightdash logo" />
                </LogoWrapper>
                <CardWrapper elevation={2}>
                    {inviteLinkQuery.error ? (
                        <NonIdealState
                            title={inviteLinkQuery.error.error.message}
                            icon="error"
                        />
                    ) : (
                        <>
                            <Title>Create your account</Title>
                            {health.data?.auth.google.oauth2ClientId && (
                                <>
                                    <GoogleLoginButton
                                        inviteCode={inviteCode}
                                    />
                                    <DividerWrapper>
                                        <Divider></Divider>
                                        <b>OR</b>
                                        <Divider></Divider>
                                    </DividerWrapper>
                                </>
                            )}
                            {allowPasswordAuthentication && (
                                <CreateUserForm
                                    isLoading={isLoading}
                                    readOnlyEmail={inviteLinkQuery.data?.email}
                                    onSubmit={(data: CreateUserArgs) => {
                                        mutate({
                                            inviteCode,
                                            ...data,
                                        });
                                    }}
                                />
                            )}
                        </>
                    )}
                </CardWrapper>
                {inviteLinkQuery.error && (
                    <FormFooterCopy>
                        By creating an account, you agree to our{' '}
                        <FooterCta
                            href="https://www.lightdash.com/privacy-policy"
                            target="_blank"
                        >
                            Privacy Policy.
                        </FooterCta>
                    </FormFooterCopy>
                )}
            </FormWrapper>
        </Page>
    );
};

export default Signup;
