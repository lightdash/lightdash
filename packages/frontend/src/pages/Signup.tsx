import { Intent, NonIdealState } from '@blueprintjs/core';
import {
    ApiError,
    CreateOrganizationUser,
    CreateUserArgs,
    LightdashUser,
} from '@lightdash/common';
import React, { FC, useEffect, useState } from 'react';
import { useMutation } from 'react-query';
import { useParams } from 'react-router-dom';
import { lightdashApi } from '../api';
import { GoogleLoginButton } from '../components/common/GoogleLoginButton';
import Page from '../components/common/Page/Page';
import CreateUserForm from '../components/CreateUserForm';
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
    org: string | undefined;
    email: string | undefined;
    setReadyToJoin: (isReady: boolean) => void;
}

const WelcomeCard: FC<WelcomeCardProps> = ({ setReadyToJoin }) => {
    const email = 'nathalia+test@gmail.com';
    const org = 'Super company';

    return (
        <>
            <LogoWrapper>
                <Logo src={LightdashLogo} alt="lightdash logo" />
            </LogoWrapper>
            <CardWrapper elevation={2}>
                <Title>You’ve been invited!</Title>
                {email && <BoldSubtitle>{email}</BoldSubtitle>}
                <Subtitle>
                    {`Your teammates ${
                        org && `at ${org}`
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
        </>
    );
};

const ExpiredCard: FC = () => {
    return (
        <>
            <LogoWrapper>
                <Logo src={LightdashLogo} alt="lightdash logo" />
            </LogoWrapper>
            <CardWrapper elevation={2}>
                <Title>This invite link has expired 🙈</Title>
                <Subtitle>
                    Please check with the person who shared it with you to see
                    if there’s a new link available.
                </Subtitle>
            </CardWrapper>
        </>
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
    const { user, health } = useApp();
    const { showToastError } = useApp();
    const { identify } = useTracking();
    const [isReadyToJoin, setIsReadyToJoin] = useState<boolean>(false);
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

    // expiresAt: Date;
    // inviteCode: string;
    // inviteUrl: string;
    // organisationUuid: string;
    // userUuid: string;
    // email: string;

    const allowPasswordAuthentication =
        !health.data?.auth.disablePasswordAuthentication;
    const isLinkExpired = false;
    console.log(inviteLinkQuery);

    useEffect(() => {
        if (inviteCode.includes('&from=email')) {
            setIsReadyToJoin(true);
        }
    }, [inviteCode]);

    // if (health.isLoading || inviteLinkQuery.isLoading) {
    //     return <PageSpinner />;
    // }

    // if (health.status === 'success' && health.data?.isAuthenticated) {
    //     return <Redirect to={{ pathname: '/' }} />;
    // }

    return (
        <Page isFullHeight>
            <FormWrapper>
                {!isLinkExpired ? (
                    isReadyToJoin ? (
                        <>
                            <CardWrapper elevation={2}>
                                {inviteLinkQuery.error ? (
                                    <NonIdealState
                                        title={
                                            inviteLinkQuery.error.error.message
                                        }
                                        icon="error"
                                    />
                                ) : (
                                    <>
                                        <Title>Create your account</Title>
                                        {health.data?.auth.google
                                            .oauth2ClientId && (
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
                                                readOnlyEmail={
                                                    inviteLinkQuery.data?.email
                                                }
                                                onSubmit={(
                                                    data: CreateUserArgs,
                                                ) => {
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
                            {!inviteLinkQuery.error && (
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
                        </>
                    ) : (
                        <WelcomeCard
                            org={inviteLinkQuery.data?.organisationUuid}
                            email={inviteLinkQuery.data?.email}
                            setReadyToJoin={setIsReadyToJoin}
                        />
                    )
                ) : (
                    <ExpiredCard />
                )}
            </FormWrapper>
        </Page>
    );
};

export default Signup;
