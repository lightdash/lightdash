import {
    InviteLinkPurpose,
    type ActivateUserWithInviteCode,
    type ApiError,
    type CreateUserArgs,
    type LightdashUser,
} from '@lightdash/common';
import {
    Anchor,
    Box,
    Button,
    Divider,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState, type FC } from 'react';
import { Navigate, useLocation, useParams } from 'react-router';
import { type LightdashApi } from '../api';
import AuthLayout from '../components/common/AuthLayout';
import { ThirdPartySignInButton } from '../components/common/ThirdPartySignInButton';
import PageSpinner from '../components/PageSpinner';
import CreateUserForm from '../components/RegisterForms/CreateUserForm';
import { useOrganization } from '../hooks/organization/useOrganization';
import useToaster from '../hooks/toaster/useToaster';
import { useFlashMessages } from '../hooks/useFlashMessages';
import {
    useActivateInviteLinkMutation,
    useInviteLink,
} from '../hooks/useInviteLink';
import useApp from '../providers/App/useApp';
import { useLightdashApi } from '../providers/LightdashApi/useLightdashApi';
import useTracking from '../providers/Tracking/useTracking';
import classes from './Invite.module.css';

interface WelcomeCardProps {
    email: string | undefined;
    expiresAt: Date;
    setReadyToJoin: (isReady: boolean) => void;
}

const InviteExpirationText: FC<{
    expiresAt: Date;
}> = ({ expiresAt }) => {
    const expirationDate = new Date(expiresAt);

    return (
        <Text c="dimmed" ta="left" fz="sm">
            This invite link expires on{' '}
            <time dateTime={expirationDate.toISOString()}>
                {expirationDate.toLocaleString(undefined, {
                    dateStyle: 'long',
                    timeStyle: 'short',
                })}
            </time>
            .
        </Text>
    );
};

const WelcomeCard: FC<WelcomeCardProps> = ({
    email,
    expiresAt,
    setReadyToJoin,
}) => {
    const { data: org } = useOrganization();

    const content = (
        <Stack gap="md" align="stretch">
            <Title order={3}>You’ve been invited!</Title>
            {email && (
                <Text fw="600" size="md">
                    {email}
                </Text>
            )}
            <Text c="dimmed" ta="left">
                {`Your teammates ${
                    org?.name ? `at ${org.name}` : ''
                } are using Lightdash to discover
                    and share data insights. Join your team to start exploring
                    your data!`}
            </Text>
            <InviteExpirationText expiresAt={expiresAt} />
            <Button onClick={() => setReadyToJoin(true)}>Join your team</Button>
        </Stack>
    );

    return (
        <>
            <Box data-cy="welcome-user">{content}</Box>
            <Text c="dimmed" ta="left" fz="sm" fw={500}>
                {`Not ${email ? email : 'for you'}?`}
                <br />
                <Text c="dimmed" ta="left" fz="xs" fw={500}>
                    Ignore this invite link and contact your workspace admin.
                </Text>
            </Text>
        </>
    );
};

const ErrorCard: FC<{ title: string }> = ({ title }) => {
    const content = (
        <Stack gap="md" align="stretch">
            <Title order={3}>{title}</Title>
            <Text c="dimmed" ta="left">
                Please check with the person who shared it with you to see if
                there’s a new link available.
            </Text>
        </Stack>
    );

    return <Box data-cy="welcome-user">{content}</Box>;
};

const PrivacyTermsFootnote: FC = () => (
    <Text c="dimmed" ta="center" fz="sm" fw={500}>
        By creating an account, you agree to
        <br />
        our{' '}
        <Anchor
            href="https://www.lightdash.com/privacy-policy"
            target="_blank"
            fz="sm"
            fw={500}
        >
            Privacy Policy
        </Anchor>{' '}
        and our{' '}
        <Anchor
            href="https://www.lightdash.com/terms-of-service"
            target="_blank"
            fz="sm"
            fw={500}
        >
            Terms of Service.
        </Anchor>
    </Text>
);

interface OneClickCardProps {
    email: string;
    expiresAt: Date;
    isSetupInvite: boolean;
    isLoading: boolean;
    onActivate: () => void;
}

const OneClickCard: FC<OneClickCardProps> = ({
    email,
    expiresAt,
    isSetupInvite,
    isLoading,
    onActivate,
}) => {
    const content = (
        <Stack gap="md" align="stretch">
            <Title order={3} ta="left">
                {isSetupInvite
                    ? 'You’ve been asked to help with setup'
                    : 'You’ve been invited to Lightdash'}
            </Title>
            <Text c="dimmed" ta="left">
                {isSetupInvite
                    ? 'One click and we’ll take you straight to connecting the data warehouse.'
                    : 'One click to join your team.'}
            </Text>
            <InviteExpirationText expiresAt={expiresAt} />
            <Button
                fullWidth
                loading={isLoading}
                onClick={onActivate}
                classNames={{ label: classes.oneClickLabel }}
            >
                Continue as {email}
            </Button>
        </Stack>
    );

    return <Box data-cy="one-click-invite">{content}</Box>;
};

const createUserQuery = async (
    lightdashApi: LightdashApi,
    data: ActivateUserWithInviteCode,
) =>
    lightdashApi<LightdashUser>({
        url: `/user`,
        method: 'POST',
        body: JSON.stringify(data),
        sensitive: true,
    });

const Invite: FC = () => {
    const lightdashApi = useLightdashApi();
    const { inviteCode } = useParams<{ inviteCode: string }>();
    const { health } = useApp();
    const { showToastError, showToastApiError } = useToaster();
    const flashMessages = useFlashMessages();

    useEffect(() => {
        if (flashMessages.data?.error) {
            showToastError({
                title: 'Failed to authenticate',
                subtitle: flashMessages.data.error.join('\n'),
            });
        }
    }, [flashMessages.data, showToastError]);
    const { search } = useLocation();
    const { identify } = useTracking();
    const [isLinkFromEmail, setIsLinkFromEmail] = useState<boolean>(false);
    const inviteLinkQuery = useInviteLink(inviteCode);

    const isSetupInvite =
        inviteLinkQuery.data?.purpose === InviteLinkPurpose.Setup;
    const redirectUrl = isSetupInvite ? '/onboarding/data-source' : '/';

    const activateInvite = useActivateInviteLinkMutation(
        inviteCode,
        redirectUrl,
    );

    const { isLoading, mutate, isSuccess } = useMutation<
        LightdashUser,
        ApiError,
        ActivateUserWithInviteCode
    >(
        (data: ActivateUserWithInviteCode) =>
            createUserQuery(lightdashApi, data),
        {
            mutationKey: ['create_user'],
            onSuccess: (data) => {
                identify({ id: data.userUuid });
                window.location.href = redirectUrl;
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to create user`,
                    apiError: error,
                });
            },
        },
    );

    const showOneClick =
        inviteLinkQuery.data?.authentication.allowOneClickActivation &&
        Boolean(inviteCode);

    useEffect(() => {
        const searchParams = new URLSearchParams(search);
        const fromParam = searchParams.get('from');
        if (fromParam === 'email') {
            setIsLinkFromEmail(true);
        }
    }, [search]);

    if (health.isInitialLoading || inviteLinkQuery.isInitialLoading) {
        return <PageSpinner />;
    }

    if (health.status === 'success' && health.data?.isAuthenticated) {
        return <Navigate to={{ pathname: redirectUrl }} />;
    }

    const ssoProviders =
        inviteLinkQuery.data?.authentication.ssoProviders ?? [];
    const ssoLogins = ssoProviders.length > 0 && (
        <Stack>
            {ssoProviders.map((providerName) => (
                <ThirdPartySignInButton
                    key={providerName}
                    providerName={providerName}
                    inviteCode={inviteCode}
                    loginHint={inviteLinkQuery.data?.email}
                    forceShow
                    intent="signup"
                    redirect={redirectUrl}
                />
            ))}
        </Stack>
    );
    const passwordLogin = inviteLinkQuery.data?.authentication
        .allowPasswordSignup &&
        inviteCode && (
            <CreateUserForm
                isLoading={isLoading || isSuccess}
                readOnlyEmail={inviteLinkQuery.data?.email}
                onSubmit={({
                    firstName,
                    lastName,
                    password,
                }: CreateUserArgs) => {
                    mutate({
                        inviteCode,
                        firstName,
                        lastName,
                        password,
                    });
                }}
            />
        );
    const logins = (
        <>
            {ssoLogins}
            {ssoLogins && passwordLogin && (
                <Divider
                    my="md"
                    labelPosition="center"
                    label={
                        <Text c="dimmed" size="sm" fw={500}>
                            OR
                        </Text>
                    }
                />
            )}
            {passwordLogin}
        </>
    );
    const signupContent = (
        <>
            <Title order={3} ta="left" mb="md">
                {isSetupInvite
                    ? 'You’ve been asked to help with setup'
                    : 'Sign up'}
            </Title>
            {isSetupInvite && (
                <Text c="dimmed" ta="left" mb="md">
                    Create your account and we’ll take you straight to warehouse
                    setup.
                </Text>
            )}
            {inviteLinkQuery.data ? (
                <InviteExpirationText
                    expiresAt={inviteLinkQuery.data.expiresAt}
                />
            ) : null}
            {logins}
        </>
    );

    return (
        <AuthLayout pageTitle="Register">
            {inviteLinkQuery.error ? (
                <ErrorCard
                    title={
                        inviteLinkQuery.error.error.name === 'ExpiredError'
                            ? 'This invite link has expired 🙈'
                            : inviteLinkQuery.error.error.message
                    }
                />
            ) : showOneClick && inviteLinkQuery.data ? (
                <>
                    <OneClickCard
                        email={inviteLinkQuery.data.email}
                        expiresAt={inviteLinkQuery.data.expiresAt}
                        isSetupInvite={isSetupInvite}
                        isLoading={
                            activateInvite.isLoading || activateInvite.isSuccess
                        }
                        onActivate={() => activateInvite.mutate()}
                    />
                    {ssoLogins && (
                        <>
                            <Divider
                                my="md"
                                labelPosition="center"
                                label={
                                    <Text c="dimmed" size="sm" fw={500}>
                                        OR
                                    </Text>
                                }
                            />
                            {ssoLogins}
                        </>
                    )}
                    <PrivacyTermsFootnote />
                </>
            ) : isLinkFromEmail || isSetupInvite ? (
                <>
                    {signupContent}
                    <PrivacyTermsFootnote />
                </>
            ) : inviteLinkQuery.data ? (
                <WelcomeCard
                    email={inviteLinkQuery.data.email}
                    expiresAt={inviteLinkQuery.data.expiresAt}
                    setReadyToJoin={setIsLinkFromEmail}
                />
            ) : null}
        </AuthLayout>
    );
};

export default Invite;
