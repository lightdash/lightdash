import {
    OpenIdIdentityIssuerType,
    type ApiError,
    type CreateUserArgs,
    type LightdashUser,
} from '@lightdash/common';
import {
    Anchor,
    Card,
    Divider,
    Image,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { useEffect, type FC } from 'react';
import { useLocation } from 'react-router-dom';
import { lightdashApi } from '../api';
import Page from '../components/common/Page/Page';
import { ThirdPartySignInButton } from '../components/common/ThirdPartySignInButton';
import PageSpinner from '../components/PageSpinner';
import CreateUserForm from '../components/RegisterForms/CreateUserForm';
import useToaster from '../hooks/toaster/useToaster';
import { useFlashMessages } from '../hooks/useFlashMessages';
import { useApp } from '../providers/AppProvider';
import { useTracking } from '../providers/TrackingProvider';
import LightdashLogo from '../svgs/lightdash-black.svg';

const registerQuery = async (data: CreateUserArgs) =>
    lightdashApi<LightdashUser>({
        url: `/user`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const Register: FC = () => {
    const location = useLocation<{ from?: Location } | undefined>();
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
    const { identify } = useTracking();
    const redirectUrl = location.state?.from
        ? `${location.state.from.pathname}${location.state.from.search}`
        : '/';
    const { isLoading, mutate, isSuccess } = useMutation<
        LightdashUser,
        ApiError,
        CreateUserArgs
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

    if (health.isInitialLoading) {
        return <PageSpinner />;
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
                    intent="signup"
                    redirect={redirectUrl}
                />
            ))}
        </Stack>
    );
    const passwordLogin = allowPasswordAuthentication && (
        <CreateUserForm
            isLoading={isLoading || isSuccess}
            onSubmit={(data: CreateUserArgs) => {
                mutate(data);
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
                    src={LightdashLogo}
                    alt="lightdash logo"
                    width={130}
                    mx="auto"
                    my="lg"
                />
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
                        href="https://www.lightdash.com/privacy-policy"
                        target="_blank"
                    >
                        Privacy Policy
                    </Anchor>{' '}
                    and our{' '}
                    <Anchor
                        href="https://www.lightdash.com/terms-of-service"
                        target="_blank"
                    >
                        Terms of Service.
                    </Anchor>
                </Text>
            </Stack>
        </Page>
    );
};

export default Register;
