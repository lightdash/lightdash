import {
    OpenIdIdentityIssuerType,
    type ActivateUserWithInviteCode,
    type ApiError,
    type CreateUserArgs,
    type LightdashUser,
} from '@lightdash/common';
import {
    Anchor,
    Button,
    Card,
    Divider,
    Image,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState, type FC } from 'react';
import { Redirect, useLocation, useParams } from 'react-router-dom';

import { lightdashApi } from '../api';
import Page from '../components/common/Page/Page';
import { ThirdPartySignInButton } from '../components/common/ThirdPartySignInButton';
import PageSpinner from '../components/PageSpinner';
import CreateUserForm from '../components/RegisterForms/CreateUserForm';
import { useOrganization } from '../hooks/organization/useOrganization';
import useToaster from '../hooks/toaster/useToaster';
import { useFlashMessages } from '../hooks/useFlashMessages';
import { useInviteLink } from '../hooks/useInviteLink';
import { useApp } from '../providers/AppProvider';
import { useTracking } from '../providers/TrackingProvider';
import LightdashLogo from '../svgs/lightdash-black.svg';

interface WelcomeCardProps {
    email: string | undefined;
    setReadyToJoin: (isReady: boolean) => void;
    siteName: string | undefined;
}

const WelcomeCard: FC<WelcomeCardProps> = ({
    email,
    setReadyToJoin,
    siteName,
}) => {
    const { data: org } = useOrganization();

    return (
        <>
            <Card
                p="xl"
                radius="xs"
                withBorder
                shadow="xs"
                data-cy="welcome-user"
            >
                <Stack spacing="md" align="center">
                    <Title order={3}>You’ve been invited!</Title>
                    {email && (
                        <Text fw="600" size="md">
                            {email}
                        </Text>
                    )}
                    <Text color="gray.6" ta="center">
                        {`Your teammates ${
                            org?.name ? `at ${org.name}` : ''
                        } are using ${siteName} to discover
                    and share data insights. Click on the link below within the
                    next 72 hours to join your team and start exploring your
                    data!`}
                    </Text>
                    <Button onClick={() => setReadyToJoin(true)}>
                        Join your team
                    </Button>
                </Stack>
            </Card>
            <Text color="gray.6" ta="center">
                {`Not ${email ? email : 'for you'}?`}
                <br />
                Ignore this invite link and contact your workspace admin.
            </Text>
        </>
    );
};

const ErrorCard: FC<{ title: string }> = ({ title }) => {
    return (
        <Card p="xl" radius="xs" withBorder shadow="xs" data-cy="welcome-user">
            <Stack spacing="md" align="center">
                <Title order={3}>{title}</Title>
                <Text color="gray.7" ta="center">
                    Please check with the person who shared it with you to see
                    if there’s a new link available.
                </Text>
            </Stack>
        </Card>
    );
};

const createUserQuery = async (data: ActivateUserWithInviteCode) =>
    lightdashApi<LightdashUser>({
        url: `/user`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const Invite: FC = () => {
    const { inviteCode } = useParams<{ inviteCode: string }>();
    const { health } = useApp();
    const { showToastError } = useToaster();
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
    const redirectUrl = '/';
    const [isLinkFromEmail, setIsLinkFromEmail] = useState<boolean>(false);
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

    if (health.isInitialLoading || inviteLinkQuery.isInitialLoading) {
        return <PageSpinner />;
    }

    if (health.status === 'success' && health.data?.isAuthenticated) {
        return <Redirect to={{ pathname: redirectUrl }} />;
    }

    const ssoAvailable =
        health.data?.auth.google.enabled ||
        health.data?.auth.okta.enabled ||
        health.data?.auth.oneLogin.enabled ||
        health.data?.auth.azuread.enabled;
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
    const passwordLogin = allowPasswordAuthentication && (
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
                        <Text color="gray.5" size="sm" fw={500}>
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
                <Image
                    src={
                        health.data?.siteLogoBlack
                            ? health.data?.siteLogoBlack
                            : LightdashLogo
                    }
                    alt={`${health.data?.siteName} logo`}
                    width={130}
                    mx="auto"
                    my="lg"
                />
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
                        <Card p="xl" radius="xs" withBorder shadow="xs">
                            <Title order={3} ta="center" mb="md">
                                Sign up
                            </Title>
                            {logins}
                        </Card>
                        <Text color="gray.6" ta="center">
                            By creating an account, you agree to
                            <br />
                            our{' '}
                            <Anchor
                                href={`${health.data?.sitePrivacyPolicyUrl}`}
                                target="_blank"
                            >
                                Privacy Policy
                            </Anchor>{' '}
                            and our{' '}
                            <Anchor
                                href={`${health.data?.siteTOSUrl}`}
                                target="_blank"
                            >
                                Terms of Service.
                            </Anchor>
                        </Text>
                    </>
                ) : (
                    <WelcomeCard
                        email={inviteLinkQuery.data?.email}
                        setReadyToJoin={setIsLinkFromEmail}
                        siteName={health.data?.siteName}
                    />
                )}
            </Stack>
        </Page>
    );
};

export default Invite;
