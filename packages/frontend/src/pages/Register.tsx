import {
    FeatureFlags,
    OpenIdIdentityIssuerType,
    type ApiError,
    type CreateEmailOnlyUserArgs,
    type CreateUserArgs,
    type LightdashUser,
} from '@lightdash/common';
import {
    Anchor,
    Box,
    Card,
    Divider,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import { useMutation } from '@tanstack/react-query';
import { useEffect, type FC } from 'react';
import { useLocation } from 'react-router';
import { lightdashApi } from '../api';
import Page from '../components/common/Page/Page';
import { ThirdPartySignInButton } from '../components/common/ThirdPartySignInButton';
import LightdashLogo from '../components/LightdashLogo/LightdashLogo';
import PageSpinner from '../components/PageSpinner';
import CreateEmailOnlyUserForm from '../components/RegisterForms/CreateEmailOnlyUserForm';
import CreateUserForm from '../components/RegisterForms/CreateUserForm';
import useToaster from '../hooks/toaster/useToaster';
import { useFlashMessages } from '../hooks/useFlashMessages';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import useApp from '../providers/App/useApp';
import useTracking from '../providers/Tracking/useTracking';
import { EventName } from '../types/Events';

const registerQuery = async (data: CreateUserArgs | CreateEmailOnlyUserArgs) =>
    lightdashApi<LightdashUser>({
        url: `/user`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const Register: FC = () => {
    const location = useLocation();
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
    const allowPasswordAuthentication =
        !health.data?.auth.disablePasswordAuthentication;
    const emailOnlySignupFlag = useServerFeatureFlag(
        FeatureFlags.NewOnboarding,
        { retry: 3 },
    );
    const { identify, track } = useTracking();
    const redirectUrl = location.state?.from
        ? `${location.state.from.pathname}${location.state.from.search}`
        : '/';
    const { isLoading, mutate, isSuccess } = useMutation<
        LightdashUser,
        ApiError,
        CreateUserArgs | CreateEmailOnlyUserArgs
    >(registerQuery, {
        mutationKey: ['login'],
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

    if (health.isInitialLoading || emailOnlySignupFlag.isInitialLoading) {
        return <PageSpinner />;
    }

    const isEmailOnlySignup =
        (emailOnlySignupFlag.data?.enabled ?? false) &&
        !!health.data?.hasEmailClient;

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
                    intent="signup"
                    redirect={redirectUrl}
                />
            ))}
        </Stack>
    );
    const passwordLogin =
        allowPasswordAuthentication &&
        (isEmailOnlySignup ? (
            <CreateEmailOnlyUserForm
                isLoading={isLoading || isSuccess}
                onSubmit={(data: CreateEmailOnlyUserArgs) => {
                    track({
                        name: EventName.SIGNUP_FORM_SUBMITTED,
                        properties: { variant: 'email_only' },
                    });
                    mutate(data);
                }}
            />
        ) : (
            <CreateUserForm
                isLoading={isLoading || isSuccess}
                onSubmit={(data: CreateUserArgs) => {
                    track({
                        name: EventName.SIGNUP_FORM_SUBMITTED,
                        properties: { variant: 'password' },
                    });
                    mutate(data);
                }}
            />
        ));
    const logins = (
        <>
            {ssoLogins}
            {ssoLogins && passwordLogin && (
                <Divider
                    my="md"
                    labelPosition="center"
                    label={
                        <Text color="ldGray.5" size="sm" fw={500}>
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
                <Card p="xl" radius="xs" withBorder shadow="xs">
                    <Title order={3} ta="center" mb="md">
                        Sign up
                    </Title>
                    {logins}
                </Card>
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
            </Stack>
        </Page>
    );
};

export default Register;
