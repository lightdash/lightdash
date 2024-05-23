import { Stack } from '@mantine/core';
import { type FC } from 'react';
import Page from '../components/common/Page/Page';
import LoginLanding from '../features/users/components/LoginLanding';
import useToaster from '../hooks/toaster/useToaster';
import { useFeatureFlagEnabled } from '../hooks/useFeatureFlagEnabled';
import { useFlashMessages } from '../hooks/useFlashMessages';
import { useApp } from '../providers/AppProvider';
import { useTracking } from '../providers/TrackingProvider';
import LightdashLogo from '../svgs/lightdash-black.svg';

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
    const flashMessages = useFlashMessages();

    useEffect(() => {
        if (flashMessages.data?.error) {
            showToastError({
                title: 'Failed to authenticate',
                subtitle: flashMessages.data.error.join('\n'),
            });
        }
    }, [flashMessages.data, showToastError]);

    const redirectUrl = location.state?.from
        ? `${location.state.from.pathname}${location.state.from.search}`
        : '/';

    const form = useForm<LoginParams>({
        initialValues: {
            email: '',
            password: '',
        },
        validate: zodResolver(
            z.object({
                email: getEmailSchema(),
            }),
        ),
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

    if (health.isInitialLoading || isDemo) {
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
        health.data?.auth.azuread.enabled ||
        health.data?.auth.oidc.enabled;
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
                <Text mx="auto">
                    Don't have an account?{' '}
                    <Anchor href="/register">Sign up</Anchor>
                </Text>
            </Stack>
        </form>
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
        <>
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
            <LoginLanding />
        </Stack>
    ) : (
        <Page title="Login" withCenteredContent>
            <Stack w={400} mt="4xl">
                <LoginLanding />
            </Stack>
        </Page>
    );
};

export default Login;
