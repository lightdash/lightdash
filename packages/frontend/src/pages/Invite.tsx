import {
    FeatureFlags,
    InviteLinkPurpose,
    OpenIdIdentityIssuerType,
    type ActivateUserWithInviteCode,
    type ApiError,
    type CreateUserArgs,
    type LightdashUser,
} from '@lightdash/common';
import {
    Anchor,
    Box,
    Button,
    Card,
    Divider,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState, type FC } from 'react';
import { Navigate, useLocation, useParams } from 'react-router';
import { lightdashApi } from '../api';
import Page from '../components/common/Page/Page';
import { ThirdPartySignInButton } from '../components/common/ThirdPartySignInButton';
import LightdashLogo from '../components/LightdashLogo/LightdashLogo';
import PageSpinner from '../components/PageSpinner';
import CreateUserForm from '../components/RegisterForms/CreateUserForm';
import { useOrganization } from '../hooks/organization/useOrganization';
import useToaster from '../hooks/toaster/useToaster';
import { useFlashMessages } from '../hooks/useFlashMessages';
import {
    useActivateInviteLinkMutation,
    useInviteLink,
} from '../hooks/useInviteLink';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import useApp from '../providers/App/useApp';
import useTracking from '../providers/Tracking/useTracking';

interface WelcomeCardProps {
    email: string | undefined;
    setReadyToJoin: (isReady: boolean) => void;
}

const WelcomeCard: FC<WelcomeCardProps> = ({ email, setReadyToJoin }) => {
    const { data: org } = useOrganization();

    return (
        <>
            <Card p="xl" withBorder shadow="subtle" data-cy="welcome-user">
                <Stack gap="md" align="center">
                    <Title order={3}>You’ve been invited!</Title>
                    {email && (
                        <Text fw="600" size="md">
                            {email}
                        </Text>
                    )}
                    <Text color="ldGray.6" ta="center">
                        {`Your teammates ${
                            org?.name ? `at ${org.name}` : ''
                        } are using Lightdash to discover
                    and share data insights. Click on the link below within the
                    next 72 hours to join your team and start exploring your
                    data!`}
                    </Text>
                    <Button onClick={() => setReadyToJoin(true)}>
                        Join your team
                    </Button>
                </Stack>
            </Card>
            <Text c="ldGray.7" ta="center" fz="sm" fw={500}>
                {`Not ${email ? email : 'for you'}?`}
                <br />
                <Text c="ldGray.6" ta="center" fz="xs" fw={500}>
                    Ignore this invite link and contact your workspace admin.
                </Text>
            </Text>
        </>
    );
};

const ErrorCard: FC<{ title: string }> = ({ title }) => {
    return (
        <Card p="xl" withBorder shadow="subtle" data-cy="welcome-user">
            <Stack gap="md" align="center">
                <Title order={3}>{title}</Title>
                <Text c="ldGray.7" ta="center">
                    Please check with the person who shared it with you to see
                    if there’s a new link available.
                </Text>
            </Stack>
        </Card>
    );
};

const PrivacyTermsFootnote: FC = () => (
    <Text c="ldGray.6" ta="center" fz="sm" fw={500}>
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
    isSetupInvite: boolean;
    isLoading: boolean;
    onActivate: () => void;
}

const OneClickCard: FC<OneClickCardProps> = ({
    email,
    isSetupInvite,
    isLoading,
    onActivate,
}) => (
    <Card p="xl" withBorder shadow="subtle" data-cy="one-click-invite">
        <Stack gap="md" align="center">
            <Title order={3} ta="center">
                {isSetupInvite
                    ? 'You’ve been asked to help with setup'
                    : 'You’ve been invited to Lightdash'}
            </Title>
            <Text c="ldGray.6" ta="center">
                {isSetupInvite
                    ? 'One click and we’ll take you straight to connecting the data warehouse.'
                    : 'One click to join your team.'}
            </Text>
            <Button fullWidth loading={isLoading} onClick={onActivate}>
                Continue as {email}
            </Button>
        </Stack>
    </Card>
);

const createUserQuery = async (data: ActivateUserWithInviteCode) =>
    lightdashApi<LightdashUser>({
        url: `/user`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const Invite: FC = () => {
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

    const newOnboardingFlag = useServerFeatureFlag(FeatureFlags.NewOnboarding, {
        retry: 3,
    });
    const activateInvite = useActivateInviteLinkMutation(
        inviteCode,
        redirectUrl,
    );

    const { isLoading, mutate, isSuccess } = useMutation<
        LightdashUser,
        ApiError,
        ActivateUserWithInviteCode
    >(createUserQuery, {
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
    });

    const allowPasswordAuthentication =
        !health.data?.auth.disablePasswordAuthentication;
    const isNewOnboarding = newOnboardingFlag.data?.enabled ?? false;
    const showOneClick =
        isNewOnboarding && allowPasswordAuthentication && Boolean(inviteCode);

    useEffect(() => {
        const searchParams = new URLSearchParams(search);
        const fromParam = searchParams.get('from');
        if (fromParam === 'email') {
            setIsLinkFromEmail(true);
        }
    }, [search]);

    if (
        health.isInitialLoading ||
        inviteLinkQuery.isInitialLoading ||
        newOnboardingFlag.isInitialLoading
    ) {
        return <PageSpinner />;
    }

    if (health.status === 'success' && health.data?.isAuthenticated) {
        return <Navigate to={{ pathname: redirectUrl }} />;
    }

    const ssoAvailable =
        health.data?.auth.google.enabled ||
        health.data?.auth.okta.enabled ||
        health.data?.auth.oneLogin.enabled ||
        health.data?.auth.azuread.enabled ||
        health.data?.auth.oidc.enabled;
    const ssoLogins = ssoAvailable && (
        <Stack>
            {Object.values(OpenIdIdentityIssuerType).map((providerName) => (
                <ThirdPartySignInButton
                    key={providerName}
                    providerName={providerName}
                    inviteCode={inviteCode}
                    intent="signup"
                    redirect={redirectUrl}
                />
            ))}
        </Stack>
    );
    const passwordLogin = allowPasswordAuthentication && inviteCode && (
        <CreateUserForm
            isLoading={isLoading || isSuccess}
            readOnlyEmail={inviteLinkQuery.data?.email}
            onSubmit={({ firstName, lastName, password }: CreateUserArgs) => {
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
                        <Text c="ldGray.5" size="sm" fw={500}>
                            OR
                        </Text>
                    }
                />
            )}
            {passwordLogin}
        </>
    );

    return (
        <Page title="Register" withCenteredContent withNavbar={false}>
            <Stack w={400} mt="4xl">
                <Box mx="auto" my="lg">
                    <LightdashLogo />
                </Box>
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
                            isSetupInvite={isSetupInvite}
                            isLoading={
                                activateInvite.isLoading ||
                                activateInvite.isSuccess
                            }
                            onActivate={() => activateInvite.mutate()}
                        />
                        <PrivacyTermsFootnote />
                    </>
                ) : isLinkFromEmail || isSetupInvite ? (
                    <>
                        <Card p="xl" withBorder shadow="subtle">
                            <Title order={3} ta="center" mb="md">
                                {isSetupInvite
                                    ? 'You’ve been asked to help with setup'
                                    : 'Sign up'}
                            </Title>
                            {isSetupInvite && (
                                <Text c="ldGray.6" ta="center" mb="md">
                                    Create your account and we’ll take you
                                    straight to warehouse setup.
                                </Text>
                            )}
                            {logins}
                        </Card>
                        <PrivacyTermsFootnote />
                    </>
                ) : (
                    <WelcomeCard
                        email={inviteLinkQuery.data?.email}
                        setReadyToJoin={setIsLinkFromEmail}
                    />
                )}
            </Stack>
        </Page>
    );
};

export default Invite;
