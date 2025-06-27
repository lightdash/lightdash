import { useCallback, useEffect, useState, type FC } from 'react';

import {
    getEmailSchema,
    isOpenIdIdentityIssuerType,
    LightdashMode,
    LocalIssuerTypes,
    SEED_ORG_1_ADMIN_EMAIL,
    SEED_ORG_1_ADMIN_PASSWORD,
    type OpenIdIdentityIssuerType,
} from '@lightdash/common';

import {
    ActionIcon,
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
import { useTimeout } from '@mantine/hooks';
import { IconX } from '@tabler/icons-react';
import { Navigate, useLocation } from 'react-router';
import { z } from 'zod';
import MantineIcon from '../../../components/common/MantineIcon';
import { ThirdPartySignInButton } from '../../../components/common/ThirdPartySignInButton';
import PageSpinner from '../../../components/PageSpinner';
import useToaster from '../../../hooks/toaster/useToaster';
import { useFlashMessages } from '../../../hooks/useFlashMessages';
import useApp from '../../../providers/App/useApp';
import useTracking from '../../../providers/Tracking/useTracking';
import LightdashLogo from '../../../svgs/lightdash-black.svg';
import {
    useFetchLoginOptions,
    useLoginWithEmailMutation,
    type LoginParams,
} from '../hooks/useLogin';

const Login: FC<{}> = () => {
    const { health } = useApp();
    const { identify } = useTracking();
    const location = useLocation();

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

    const [preCheckEmail, setPreCheckEmail] = useState<string>();
    const [isLoginOptionsLoadingDebounced, setIsLoginOptionsLoadingDebounced] =
        useState(false);

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
        isInitialLoading: isInitialLoadingLoginOptions,
        isFetching: loginOptionsFetching,
        isSuccess: loginOptionsSuccess,
    } = useFetchLoginOptions({
        email: preCheckEmail,
        useQueryOptions: {
            keepPreviousData: true,
        },
    });

    // Disable fetch once it has succeeded
    useEffect(() => {
        if (loginOptions && loginOptionsSuccess) {
            if (loginOptions.forceRedirect && loginOptions.redirectUri) {
                window.location.href = loginOptions.redirectUri;
            }
        }
    }, [loginOptionsSuccess, loginOptions]);

    const ssoOptions = loginOptions
        ? (loginOptions.showOptions.filter(
              isOpenIdIdentityIssuerType,
          ) as OpenIdIdentityIssuerType[])
        : [];

    // Delayed loading state - only show loading if request takes longer than 400ms
    const { start: startDelayedState, clear: clearDelayedState } = useTimeout(
        () => setIsLoginOptionsLoadingDebounced(true),
        400,
    );

    useEffect(() => {
        if (loginOptionsFetching) {
            // Start timer to show loading/disabled after 400ms
            startDelayedState();
        } else {
            // Request completed, hide loading/disabled immediately and clear timer
            setIsLoginOptionsLoadingDebounced(false);
            clearDelayedState();
        }
    }, [loginOptionsFetching, startDelayedState, clearDelayedState]);

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

    const isEmailLoginAvailable =
        loginOptions?.showOptions &&
        loginOptions?.showOptions.includes(LocalIssuerTypes.EMAIL);

    const formStage =
        preCheckEmail &&
        loginOptions &&
        loginOptionsSuccess &&
        !loginOptionsFetching
            ? 'login'
            : 'precheck';

    const handleFormSubmit = useCallback(() => {
        if (formStage === 'precheck' && form.values.email !== '') {
            setPreCheckEmail(form.values.email);
        } else if (
            formStage === 'login' &&
            isEmailLoginAvailable &&
            form.values.email !== '' &&
            form.values.password !== ''
        ) {
            mutate(form.values);
        }
    }, [form.values, formStage, isEmailLoginAvailable, mutate]);

    const isFormLoading =
        isLoginOptionsLoadingDebounced ||
        (loginOptionsSuccess && loginOptions.forceRedirect === true) ||
        isLoading ||
        isSuccess;

    if (health.isInitialLoading || isDemo || isInitialLoadingLoginOptions) {
        return <PageSpinner />;
    }
    if (health.status === 'success' && health.data?.requiresOrgRegistration) {
        return (
            <Navigate
                to={{
                    pathname: '/register',
                }}
                state={{ from: location.state?.from }}
            />
        );
    }
    if (health.status === 'success' && health.data?.isAuthenticated) {
        return <Navigate to={redirectUrl} />;
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
                            disabled={isFormLoading}
                            rightSection={
                                preCheckEmail ? (
                                    <ActionIcon
                                        onClick={() => {
                                            setPreCheckEmail(undefined);
                                            form.setValues({
                                                email: '',
                                                password: '',
                                            });
                                        }}
                                    >
                                        <MantineIcon icon={IconX} />
                                    </ActionIcon>
                                ) : null
                            }
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
                                    disabled={isFormLoading}
                                />
                                <Anchor href="/recover-password" mx="auto">
                                    Forgot your password?
                                </Anchor>
                                <Button
                                    type="submit"
                                    loading={isFormLoading}
                                    disabled={isFormLoading}
                                    data-cy="signin-button"
                                >
                                    Sign in
                                </Button>
                            </>
                        )}
                        {formStage === 'precheck' && (
                            <Button
                                type="submit"
                                loading={isFormLoading}
                                disabled={isFormLoading}
                                data-cy="signin-button"
                            >
                                Continue
                            </Button>
                        )}
                        {ssoOptions.length > 0 && (
                            <>
                                {(isEmailLoginAvailable ||
                                    formStage === 'precheck') && (
                                    <Divider
                                        my="sm"
                                        labelPosition="center"
                                        label={
                                            <Text
                                                color="gray.5"
                                                size="sm"
                                                fw={500}
                                            >
                                                OR
                                            </Text>
                                        }
                                    />
                                )}
                                <Stack>
                                    {ssoOptions.map((providerName) => (
                                        <ThirdPartySignInButton
                                            key={providerName}
                                            providerName={providerName}
                                            redirect={redirectUrl}
                                            disabled={isFormLoading}
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
