import { useCallback, useEffect, useMemo, useState, type FC } from 'react';

import {
    getEmailSchema,
    isOpenIdIdentityIssuerType,
    LightdashMode,
    LocalIssuerTypes,
    OpenIdIdentityIssuerType,
    SEED_ORG_1_ADMIN_EMAIL,
    SEED_ORG_1_ADMIN_PASSWORD,
} from '@lightdash/common';

import {
    Anchor,
    Button,
    Card,
    Divider,
    Image,
    PasswordInput,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { Redirect, useLocation } from 'react-router-dom';
import { z } from 'zod';
import { ThirdPartySignInButton } from '../../../components/common/ThirdPartySignInButton';
import PageSpinner from '../../../components/PageSpinner';
import useToaster from '../../../hooks/toaster/useToaster';
import { useFlashMessages } from '../../../hooks/useFlashMessages';
import { useApp } from '../../../providers/AppProvider';
import { useTracking } from '../../../providers/TrackingProvider';
import LightdashLogo from '../../../svgs/lightdash-black.svg';
import {
    useFetchLoginOptions,
    useLoginWithEmailMutation,
    type LoginParams,
} from '../hooks/useLogin';

const Login: FC<{}> = () => {
    const { health } = useApp();
    const { identify } = useTracking();
    const location = useLocation<{ from?: Location } | undefined>();

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

    const [fetchOptionsEnabled, setFetchOptionsEnabled] = useState(false);

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

    const {
        data: loginOptions,
        isLoading: loginOptionsLoading,
        isFetched: loginOptionsFetched,
        isSuccess: loginOptionsSuccess,
    } = useFetchLoginOptions({
        email: form.values.email,
        useQueryOptions: {
            enabled: fetchOptionsEnabled && form.values.email !== '',
        },
    });

    // Disable fetch once it has succeeded
    useEffect(() => {
        if (loginOptions && loginOptionsSuccess) {
            if (loginOptions.forceRedirect && loginOptions.redirectUri) {
                window.location.href = loginOptions.redirectUri;
            }
            setFetchOptionsEnabled(false);
        }
    }, [loginOptionsSuccess, loginOptions]);

    const { mutate, isLoading, isSuccess, isIdle } = useLoginWithEmailMutation({
        onSuccess: (data) => {
            identify({ id: data.userUuid });
            window.location.href = redirectUrl;
        },
        onError: ({ error }) => {
            showToastApiError({
                title: `Failed to login`,
                apiError: error,
            });
        },
    });

    // Skip login for demo app
    const isDemo = health.data?.mode === LightdashMode.DEMO;
    useEffect(() => {
        if (isDemo && isIdle) {
            mutate({
                email: SEED_ORG_1_ADMIN_EMAIL.email,
                password: SEED_ORG_1_ADMIN_PASSWORD.password,
            });
        }
    }, [isDemo, mutate, isIdle]);

    const formStage =
        loginOptionsSuccess && loginOptions?.showOptions ? 'login' : 'precheck';

    const isEmailLoginAvailable =
        loginOptions?.showOptions &&
        loginOptions?.showOptions.includes(LocalIssuerTypes.EMAIL);

    const handleFormSubmit = useCallback(() => {
        if (formStage === 'precheck' && form.values.email !== '') {
            setFetchOptionsEnabled(true);
        } else if (
            formStage === 'login' &&
            isEmailLoginAvailable &&
            form.values.email !== '' &&
            form.values.password !== ''
        ) {
            mutate(form.values);
        }
    }, [form.values, formStage, isEmailLoginAvailable, mutate]);

    const disableControls =
        (loginOptionsLoading && loginOptionsFetched) ||
        (loginOptionsSuccess && loginOptions.forceRedirect === true) ||
        isLoading ||
        isSuccess;

    const ssoOptions = useMemo(() => {
        const options = new Set<OpenIdIdentityIssuerType>();

        if (health.data?.auth.google.enabled) {
            options.add(OpenIdIdentityIssuerType.GOOGLE);
        }
        if (health.data?.auth.azuread.enabled) {
            options.add(OpenIdIdentityIssuerType.AZUREAD);
        }
        if (health.data?.auth.oneLogin.enabled) {
            options.add(OpenIdIdentityIssuerType.ONELOGIN);
        }
        if (health.data?.auth.okta.enabled) {
            options.add(OpenIdIdentityIssuerType.OKTA);
        }
        if (health.data?.auth.oidc.enabled) {
            options.add(OpenIdIdentityIssuerType.GENERIC_OIDC);
        }
        if (loginOptions) {
            const userSsoOptions = loginOptions.showOptions.filter(
                isOpenIdIdentityIssuerType,
            );
            userSsoOptions.forEach((option) => options.add(option));
        }

        return Array.from(options);
    }, [health.data, loginOptions]);

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
                <form
                    name="login"
                    onSubmit={form.onSubmit(() => handleFormSubmit())}
                >
                    <Stack spacing="lg">
                        <TextInput
                            label="Email address"
                            name="email"
                            placeholder="Your email address"
                            required
                            {...form.getInputProps('email')}
                            disabled={disableControls}
                        />
                        {isEmailLoginAvailable && formStage === 'login' && (
                            <>
                                <PasswordInput
                                    label="Password"
                                    name="password"
                                    placeholder="Your password"
                                    required
                                    autoFocus
                                    {...form.getInputProps('password')}
                                    disabled={disableControls}
                                />
                                <Anchor href="/recover-password" mx="auto">
                                    Forgot your password?
                                </Anchor>
                            </>
                        )}
                        <Button
                            type="submit"
                            loading={disableControls}
                            data-cy="signin-button"
                        >
                            {formStage === 'login' && !loginOptionsFetched
                                ? 'Sign in'
                                : 'Continue'}
                        </Button>
                        {ssoOptions.length > 0 && (
                            <>
                                <Divider
                                    my="sm"
                                    labelPosition="center"
                                    label={
                                        <Text color="gray.5" size="sm" fw={500}>
                                            OR
                                        </Text>
                                    }
                                />
                                <Stack>
                                    {ssoOptions.map((providerName) => (
                                        <ThirdPartySignInButton
                                            key={providerName}
                                            providerName={providerName}
                                            redirect={redirectUrl}
                                            disabled={disableControls}
                                        />
                                    ))}
                                </Stack>
                            </>
                        )}
                        <Text mx="auto" mt="md">
                            Don't have an account?{' '}
                            <Anchor href="/register">Sign up</Anchor>
                        </Text>
                    </Stack>
                </form>
            </Card>
        </>
    );
};

export default Login;
