import {
    getEmailSchema,
    isOpenIdIdentityIssuerType,
    LightdashMode,
    LocalIssuerTypes,
    SEED_ORG_1_ADMIN_EMAIL,
    SEED_ORG_1_ADMIN_PASSWORD,
    type LightdashUser,
    type LoginOptions,
    type MobileLoginIntent,
    type OpenIdIdentityIssuerType,
} from '@lightdash/common';
import {
    TextInput,
    Divider,
    Stack,
    Text,
    Button,
    ActionIcon,
    Anchor,
    PasswordInput,
} from '@mantine/core';
import { useForm, type UseFormReturnType } from '@mantine/form';
import { useTimeout } from '@mantine/hooks';
import { IconX } from '@tabler/icons-react';
import { zod4Resolver as zodResolver } from 'mantine-form-zod-resolver';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { z } from 'zod';
import { useAuthLayoutVariant } from '../../../components/common/AuthLayout/useAuthLayoutVariant';
import MantineIcon from '../../../components/common/MantineIcon';
import { ThirdPartySignInButton } from '../../../components/common/ThirdPartySignInButton';
import PageSpinner from '../../../components/PageSpinner';
import useToaster from '../../../hooks/toaster/useToaster';
import { useFlashMessages } from '../../../hooks/useFlashMessages';
import useApp from '../../../providers/App/useApp';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { sanitizeRedirectUrl } from '../../../utils/redirectUrl';
import { resolveInternalPath } from '../../../utils/url';
import {
    useFetchLoginOptions,
    useLoginWithEmailMutation,
    type LoginParams,
} from '../hooks/useLogin';
import {
    clearPendingSsoLoginMethod,
    readLastLoginMethod,
    writeLastLoginMethod,
    writePendingSsoLoginMethod,
} from '../utils/lastLoginMethod';
import {
    getMobileLoginIntentFromRedirect,
    setMobileLoginIntentOnRedirect,
} from '../utils/mobileLoginIntent';
import LoginWithEmailOtp from './LoginWithEmailOtp';

const getVisibleSsoOptions = ({
    loginOptions,
    mobileLoginIntent,
    preCheckEmail,
    lastUsedSsoProvider,
}: {
    loginOptions: LoginOptions | undefined;
    mobileLoginIntent: MobileLoginIntent | undefined;
    preCheckEmail: string | undefined;
    lastUsedSsoProvider: OpenIdIdentityIssuerType | undefined;
}): OpenIdIdentityIssuerType[] => {
    const shouldResolveSsoByEmail =
        mobileLoginIntent === 'sso' &&
        loginOptions?.ssoPresentation?.kind !== 'branded' &&
        !preCheckEmail;
    const ssoOptions =
        loginOptions &&
        mobileLoginIntent !== 'local' &&
        !shouldResolveSsoByEmail
            ? (loginOptions.showOptions.filter(
                  isOpenIdIdentityIssuerType,
              ) as OpenIdIdentityIssuerType[])
            : [];

    return mobileLoginIntent
        ? ssoOptions
        : lastUsedSsoProvider
          ? [
                lastUsedSsoProvider,
                ...ssoOptions.filter(
                    (provider) => provider !== lastUsedSsoProvider,
                ),
            ]
          : ssoOptions;
};

const getAlternativeLoginIntent = ({
    formStage,
    mobileLoginIntent,
    isEmailLoginAvailable,
    isEmailOtpLoginAvailable,
    ssoOptions,
    loginOptions,
}: {
    formStage: 'precheck' | 'login';
    mobileLoginIntent: MobileLoginIntent | undefined;
    isEmailLoginAvailable: boolean;
    isEmailOtpLoginAvailable: boolean;
    ssoOptions: OpenIdIdentityIssuerType[];
    loginOptions: LoginOptions | undefined;
}): MobileLoginIntent | undefined => {
    if (
        formStage === 'login' &&
        mobileLoginIntent === 'local' &&
        !isEmailLoginAvailable &&
        !isEmailOtpLoginAvailable &&
        loginOptions?.ssoPresentation?.kind !== 'none'
    ) {
        return 'sso';
    }
    if (
        formStage === 'login' &&
        mobileLoginIntent === 'sso' &&
        ssoOptions.length === 0 &&
        loginOptions?.localEmailAvailable
    ) {
        return 'local';
    }
    return undefined;
};

export const LoginForm: FC<{
    alternativeLoginIntent: MobileLoginIntent | undefined;
    availability: { email: boolean; emailOtp: boolean };
    form: UseFormReturnType<LoginParams>;
    formStatus: 'idle' | 'loading';
    formStage: 'precheck' | 'login';
    lastUsedSsoProvider: OpenIdIdentityIssuerType | undefined;
    layout: 'new' | 'legacy';
    loginHint: string | undefined;
    mobileLoginIntent: MobileLoginIntent | undefined;
    onClearEmail: () => void;
    onEmailOtpSuccess: (data: LightdashUser) => void;
    onSubmit: () => void;
    preCheckEmail: string | undefined;
    redirectUrl: string;
    signupPath: string | null;
    signupUrl: string;
    ssoOptions: OpenIdIdentityIssuerType[];
}> = ({
    alternativeLoginIntent,
    availability,
    form,
    formStatus,
    formStage,
    lastUsedSsoProvider,
    layout,
    loginHint,
    mobileLoginIntent,
    onClearEmail,
    onEmailOtpSuccess,
    onSubmit,
    preCheckEmail,
    redirectUrl,
    signupPath,
    signupUrl,
    ssoOptions,
}) => {
    const isNewLayout = layout === 'new';
    const isFormLoading = formStatus === 'loading';
    const ssoButtons = ssoOptions.length > 0 && (
        <Stack>
            {ssoOptions.map((providerName) => (
                <ThirdPartySignInButton
                    key={providerName}
                    providerName={providerName}
                    intent={isNewLayout ? 'continue' : 'signin'}
                    redirect={redirectUrl}
                    loginHint={loginHint}
                    disabled={isFormLoading}
                    forceShow
                    lastUsed={providerName === lastUsedSsoProvider}
                    onClick={() => writePendingSsoLoginMethod(providerName)}
                />
            ))}
        </Stack>
    );
    const ssoDivider = (
        <Divider
            my="sm"
            labelPosition="center"
            label={
                <Text c="ldGray.5" size="sm" fw={500}>
                    {isNewLayout ? 'or' : 'OR'}
                </Text>
            }
        />
    );

    return (
        <form name="login" onSubmit={form.onSubmit(onSubmit)}>
            <Stack gap="lg">
                {isNewLayout && ssoButtons ? (
                    <>
                        {ssoButtons}
                        {ssoDivider}
                    </>
                ) : null}
                <TextInput
                    label={isNewLayout ? 'Work email' : 'Email address'}
                    name="email"
                    type="email"
                    inputMode="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder={
                        isNewLayout ? 'maya@acme.com' : 'Your email address'
                    }
                    required
                    {...form.getInputProps('email')}
                    disabled={isFormLoading}
                    rightSectionPointerEvents="all"
                    rightSection={
                        preCheckEmail ? (
                            <ActionIcon
                                aria-label="Clear email address"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={onClearEmail}
                            >
                                <MantineIcon icon={IconX} />
                            </ActionIcon>
                        ) : null
                    }
                />
                {availability.email && formStage === 'login' ? (
                    <>
                        <PasswordInput
                            label="Password"
                            name="password"
                            placeholder="Your password"
                            autoComplete="current-password"
                            required
                            autoFocus
                            {...form.getInputProps('password')}
                            disabled={isFormLoading}
                        />
                        <Anchor
                            inherit
                            component={Link}
                            to="/recover-password"
                            mx="auto"
                        >
                            Forgot your password?
                        </Anchor>
                        <Button
                            type="submit"
                            loading={isFormLoading}
                            disabled={isFormLoading}
                            fullWidth={isNewLayout}
                            data-cy="signin-button"
                        >
                            Sign in
                        </Button>
                    </>
                ) : null}
                {availability.emailOtp && formStage === 'login' ? (
                    <LoginWithEmailOtp
                        email={preCheckEmail ?? form.values.email}
                        disabled={isFormLoading}
                        onSuccess={onEmailOtpSuccess}
                    />
                ) : null}
                {formStage === 'precheck' ? (
                    <Button
                        type="submit"
                        loading={isFormLoading}
                        disabled={isFormLoading}
                        fullWidth={isNewLayout}
                        data-cy="signin-button"
                    >
                        Continue
                    </Button>
                ) : null}
                {alternativeLoginIntent ? (
                    <Button
                        component="a"
                        variant="default"
                        href={setMobileLoginIntentOnRedirect(
                            redirectUrl,
                            window.location.origin,
                            alternativeLoginIntent,
                        )}
                    >
                        Continue with{' '}
                        {alternativeLoginIntent === 'sso'
                            ? 'SSO'
                            : 'work email'}
                    </Button>
                ) : null}
                {!isNewLayout && ssoButtons ? (
                    <>
                        {availability.email ||
                        availability.emailOtp ||
                        formStage === 'precheck'
                            ? ssoDivider
                            : null}
                        {ssoButtons}
                    </>
                ) : null}
                {!mobileLoginIntent ? (
                    <Text mx="auto" mt="md" fz="sm">
                        {isNewLayout
                            ? 'New to Lightdash?'
                            : "Don't have an account?"}{' '}
                        {signupPath ? (
                            <Anchor component={Link} to={signupPath} fz="sm">
                                {isNewLayout ? 'Create an account' : 'Sign up'}
                            </Anchor>
                        ) : (
                            <Anchor href={signupUrl} fz="sm">
                                {isNewLayout ? 'Create an account' : 'Sign up'}
                            </Anchor>
                        )}
                    </Text>
                ) : null}
            </Stack>
        </form>
    );
};

const Login: FC<{}> = () => {
    const { health } = useApp();
    const { identify, track } = useTracking();
    const location = useLocation();
    const { isNewLayout } = useAuthLayoutVariant();

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

    // Reaching the login page means any SSO attempt from this tab failed or was
    // abandoned, so it must never become the recorded last-used method.
    useEffect(() => {
        clearPendingSsoLoginMethod();
    }, []);

    const queryParams = new URLSearchParams(location.search);
    const redirectParam = queryParams.get('redirect');

    const [preCheckEmail, setPreCheckEmail] = useState<string>();
    const [isLoginOptionsLoadingDebounced, setIsLoginOptionsLoadingDebounced] =
        useState(false);

    // The method this browser last logged in with (recorded client-side on the
    // previous login). Lets us pre-fill the email and surface a "Last used" SSO
    // button on the first page — including private per-org SSO methods that are
    // otherwise hidden until the email is prechecked.
    const lastLoginMethod = useMemo(() => readLastLoginMethod(), []);
    const lastUsedSsoProvider =
        lastLoginMethod &&
        isOpenIdIdentityIssuerType(lastLoginMethod.issuerType)
            ? lastLoginMethod.issuerType
            : undefined;

    const redirectUrl = sanitizeRedirectUrl(
        location.state?.from
            ? `${location.state.from.pathname}${location.state.from.search}`
            : redirectParam,
    );
    const mobileLoginIntent = getMobileLoginIntentFromRedirect(
        redirectUrl,
        window.location.origin,
    );

    const form = useForm<LoginParams>({
        initialValues: {
            email: lastLoginMethod?.email ?? '',
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
        mobileLoginIntent,
        useQueryOptions: {
            keepPreviousData: true,
        },
    });

    // Disable fetch once it has succeeded
    useEffect(() => {
        if (loginOptions && loginOptionsSuccess) {
            if (loginOptions.forceRedirect && loginOptions.redirectUri) {
                // Forward the post-login redirect target so the backend can
                // persist it as `returnTo` (see `storeOIDCRedirect`). Without
                // this, SSO-only orgs always land on `/` after auth.
                const ssoUrl = new URL(loginOptions.redirectUri);
                if (redirectUrl && redirectUrl !== '/') {
                    ssoUrl.searchParams.set('redirect', redirectUrl);
                }
                window.location.href = ssoUrl.href;
            }
        }
    }, [loginOptionsSuccess, loginOptions, redirectUrl]);

    const trackedMethodForEmail = useRef<string | undefined>(undefined);
    useEffect(() => {
        if (
            !preCheckEmail ||
            !loginOptions ||
            !loginOptionsSuccess ||
            loginOptionsFetching
        ) {
            return;
        }
        if (trackedMethodForEmail.current === preCheckEmail) {
            return;
        }
        trackedMethodForEmail.current = preCheckEmail;
        const method =
            loginOptions.forceRedirect && loginOptions.redirectUri
                ? 'sso_redirect'
                : loginOptions.showOptions.includes(LocalIssuerTypes.EMAIL)
                  ? 'password'
                  : loginOptions.showOptions.includes(
                          LocalIssuerTypes.EMAIL_OTP,
                      )
                    ? 'email_otp'
                    : undefined;
        if (method) {
            track({
                name: EventName.LOGIN_FLOW_METHOD_SELECTED,
                properties: { method },
            });
        }
    }, [
        preCheckEmail,
        loginOptions,
        loginOptionsSuccess,
        loginOptionsFetching,
        track,
    ]);

    const ssoOptions = getVisibleSsoOptions({
        loginOptions,
        mobileLoginIntent,
        preCheckEmail,
        lastUsedSsoProvider,
    });

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

    const handleLoginSuccess = useCallback(
        (data: LightdashUser, issuerType: LocalIssuerTypes) => {
            // Use the authenticated user's email rather than the form value so
            // it's always the real address (e.g. the demo auto-login path).
            if (data.email) {
                writeLastLoginMethod({
                    issuerType,
                    email: data.email,
                });
            }
            identify({ id: data.userUuid });
            window.location.href = redirectUrl;
        },
        [identify, redirectUrl],
    );

    const { mutate, isLoading, isSuccess, isIdle } = useLoginWithEmailMutation({
        onSuccess: (data) => handleLoginSuccess(data, LocalIssuerTypes.EMAIL),
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

    const isEmailLoginAvailable = Boolean(
        mobileLoginIntent !== 'sso' &&
        loginOptions?.showOptions.includes(LocalIssuerTypes.EMAIL),
    );

    const isEmailOtpLoginAvailable = Boolean(
        mobileLoginIntent !== 'sso' &&
        loginOptions?.showOptions.includes(LocalIssuerTypes.EMAIL_OTP),
    );

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

    const alternativeLoginIntent = getAlternativeLoginIntent({
        formStage,
        mobileLoginIntent,
        isEmailLoginAvailable,
        isEmailOtpLoginAvailable,
        ssoOptions,
        loginOptions,
    });

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

    const signupUrl = health.data?.signupUrl || '/register';
    const signupPath = resolveInternalPath(signupUrl);

    return (
        <LoginForm
            alternativeLoginIntent={alternativeLoginIntent}
            availability={{
                email: isEmailLoginAvailable,
                emailOtp: isEmailOtpLoginAvailable,
            }}
            form={form}
            formStatus={isFormLoading ? 'loading' : 'idle'}
            formStage={formStage}
            lastUsedSsoProvider={lastUsedSsoProvider}
            layout={isNewLayout ? 'new' : 'legacy'}
            loginHint={preCheckEmail ?? lastLoginMethod?.email}
            mobileLoginIntent={mobileLoginIntent}
            onClearEmail={() => {
                setPreCheckEmail(undefined);
                form.setValues({ email: '', password: '' });
            }}
            onEmailOtpSuccess={(data) =>
                handleLoginSuccess(data, LocalIssuerTypes.EMAIL_OTP)
            }
            onSubmit={handleFormSubmit}
            preCheckEmail={preCheckEmail}
            redirectUrl={redirectUrl}
            signupPath={signupPath}
            signupUrl={signupUrl}
            ssoOptions={ssoOptions}
        />
    );
};

export default Login;
