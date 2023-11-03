import {
    ApiError,
    LightdashMode,
    LightdashUser,
    OpenIdIdentityIssuerType,
    SEED_ORG_1_ADMIN_EMAIL,
    SEED_ORG_1_ADMIN_PASSWORD,
    validateEmail,
} from '@lightdash/common';
import {
    Anchor,
    Button,
    Card,
    Image,
    PasswordInput,
    Stack,
    TextInput,
    Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { FC, useEffect } from 'react';
import { useMutation } from 'react-query';
import { Redirect, useLocation } from 'react-router-dom';

import { lightdashApi } from '../api';
import Page from '../components/common/Page/Page';
import { ThirdPartySignInButton } from '../components/common/ThirdPartySignInButton';
import PageSpinner from '../components/PageSpinner';
import useToaster from '../hooks/toaster/useToaster';
import { useApp } from '../providers/AppProvider';
import { useTracking } from '../providers/TrackingProvider';
import LightdashLogo from '../svgs/lightdash-black.svg';
import { Divider, DividerWrapper } from './Invite.styles';

type LoginParams = { email: string; password: string };

const loginQuery = async (data: LoginParams) =>
    lightdashApi<LightdashUser>({
        url: `/login`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const LoginContent: FC = () => {
    const location = useLocation<{ from?: Location } | undefined>();
    const { health } = useApp();
    const { showToastError } = useToaster();
    const redirectUrl = location.state?.from
        ? `${location.state.from.pathname}${location.state.from.search}`
        : '/';

    const form = useForm<LoginParams>({
        initialValues: {
            email: '',
            password: '',
        },
        validate: {
            email: (value) =>
                validateEmail(value) ? null : 'Your email address is not valid',
        },
    });

    const { identify } = useTracking();

    const { isIdle, isLoading, mutate, isSuccess } = useMutation<
        LightdashUser,
        ApiError,
        LoginParams
    >(loginQuery, {
        mutationKey: ['login'],
        onSuccess: (data) => {
            identify({ id: data.userUuid });
            window.location.href = redirectUrl;
        },
        onError: (error) => {
            form.reset();
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
        return <Redirect to={redirectUrl} />;
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
                    redirect={redirectUrl}
                />
            ))}
        </Stack>
    );

    const passwordLogin = allowPasswordAuthentication && (
        <form name="login" onSubmit={form.onSubmit((values) => mutate(values))}>
            <Stack spacing="lg">
                <TextInput
                    label="Email address"
                    name="email"
                    placeholder="Your email address"
                    required
                    {...form.getInputProps('email')}
                    disabled={isLoading || isSuccess}
                />
                <PasswordInput
                    label="Password"
                    name="password"
                    placeholder="Your password"
                    required
                    {...form.getInputProps('password')}
                    disabled={isLoading || isSuccess}
                />
                <Button
                    type="submit"
                    loading={isLoading || isSuccess}
                    data-cy="signin-button"
                >
                    Sign in
                </Button>
                {health.data?.hasEmailClient && (
                    <Anchor href="/recover-password" mx="auto">
                        Forgot your password?
                    </Anchor>
                )}
            </Stack>
        </form>
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
        <>
            <Image
                src={LightdashLogo}
                alt="lightdash logo"
                width={130}
                mx="auto"
                my="lg"
            />
            <Card p="xl" radius="xs" withBorder shadow="xs">
                <Title order={3} ta="center" mb="md">
                    Sign in
                </Title>
                {logins}
            </Card>
        </>
    );
};

const Login: FC<{ minimal?: boolean }> = ({ minimal = false }) => {
    return minimal ? (
        <Stack m="xl">
            <LoginContent />
        </Stack>
    ) : (
        <Page title="Login" withCenteredContent withNavbar={false}>
            <Stack w={400} mt="4xl">
                <LoginContent />
            </Stack>
        </Page>
    );
};

export default Login;
