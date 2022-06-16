import { Intent } from '@blueprintjs/core';
import {
    ApiError,
    CreateOrganizationUser,
    CreateUserArgs,
    LightdashUser,
} from '@lightdash/common';
import React, { FC, useEffect, useState } from 'react';
import { useMutation } from 'react-query';
import { Redirect, useLocation, useParams } from 'react-router-dom';
import { lightdashApi } from '../api';
import { GoogleLoginButton } from '../components/common/GoogleLoginButton';
import Page from '../components/common/Page/Page';
import CreateUserForm from '../components/CreateUserForm';
import PageSpinner from '../components/PageSpinner';
import { useOrganisation } from '../hooks/organisation/useOrganisation';
import { useInviteLink } from '../hooks/useInviteLink';
import { useApp } from '../providers/AppProvider';
import { useTracking } from '../providers/TrackingProvider';
import LightdashLogo from '../svgs/lightdash-black.svg';
import {
    BoldSubtitle,
    CardWrapper,
    Divider,
    DividerWrapper,
    FooterCta,
    FormFooterCopy,
    FormWrapper,
    Logo,
    LogoWrapper,
    SubmitButton,
    Subtitle,
    Title,
} from './SignUp.styles';

interface WelcomeCardProps {
    email: string | undefined;
    setReadyToJoin: (isReady: boolean) => void;
}

const WelcomeCard: FC<WelcomeCardProps> = ({ email, setReadyToJoin }) => {
    const { data: org } = useOrganisation();

    return (
        <>
            <CardWrapper elevation={2} data-cy="welcome-user">
                <Title>You’ve been invited!</Title>
                {email && <BoldSubtitle>{email}</BoldSubtitle>}
                <Subtitle>
                    {`Your teammates ${
                        org?.name ? `at ${org.name}` : ''
                    } are using Lightdash to discover
                    and share data insights. Click on the link below within the
                    next 72 hours to join your team and start exploring your
                    data!`}
                </Subtitle>
                <SubmitButton
                    intent={Intent.PRIMARY}
                    onClick={() => setReadyToJoin(true)}
                    text="Join your team"
                />
            </CardWrapper>
            <FormFooterCopy>
                {`Not ${email ? email : 'for you'}?`}
                <br />
                Ignore this invite link and contact your workspace admin.
            </FormFooterCopy>
        </>
    );
};

const ErrorCard: FC<{ title: string }> = ({ title }) => {
    return (
        <CardWrapper elevation={2}>
            <Title>{title}</Title>
            <Subtitle>
                Please check with the person who shared it with you to see if
                there’s a new link available.
            </Subtitle>
        </CardWrapper>
    );
};

const createUserQuery = async (data: CreateOrganizationUser) =>
    lightdashApi<LightdashUser>({
        url: `/user`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const Signup: FC = () => {
    const { inviteCode } = useParams<{ inviteCode: string }>();
    const { health, showToastError } = useApp();
    const { search } = useLocation();
    const { identify } = useTracking();
    const [isLinkFromEmail, setIsLinkFromEmail] = useState<boolean>(false);
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

    useEffect(() => {
        const searchParams = new URLSearchParams(search);
        const fromParam = searchParams.get('from');
        if (fromParam === 'email') {
            setIsLinkFromEmail(true);
        }
    }, [search]);

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
                {inviteLinkQuery.error ? (
                    <ErrorCard
                        title={
                            inviteLinkQuery.error.error.name === 'ExpiredError'
                                ? 'This invite link has expired 🙈'
                                : inviteLinkQuery.error.error.message
                        }
                    />
                ) : isLinkFromEmail ? (
                    <>
                        <CardWrapper elevation={2}>
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
                    </>
                ) : (
                    <WelcomeCard
                        email={inviteLinkQuery.data?.email}
                        setReadyToJoin={setIsLinkFromEmail}
                    />
                )}
            </FormWrapper>
        </Page>
    );
};

export default Signup;
