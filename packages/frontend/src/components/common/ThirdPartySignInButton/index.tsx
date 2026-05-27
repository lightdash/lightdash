import {
    OpenIdIdentityIssuerType,
    type OpenIdIdentitySummary,
} from '@lightdash/common';
import { Badge, Box, Button, Image, type ButtonProps } from '@mantine-8/core';
import { IconLock } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import useApp from '../../../providers/App/useApp';
import MantineIcon from '../MantineIcon';
import {
    GOOGLE_LOGO,
    MICROSOFT_LOGO,
    OKTA_LOGO,
    ONELOGIN_LOGO,
} from './ssoProviderLogos';
import classes from './ThirdPartySignInButton.module.css';

type ThirdPartySignInButtonProps = {
    inviteCode?: string;
    intent?: 'signin' | 'add' | 'signup';
    providerName: OpenIdIdentitySummary['issuerType'];
    // Default redirect is the current window.location.href
    redirect?: string;
    /**
     * Email captured during the precheck step. Forwarded as `login_hint` to
     * the SSO login route so the backend can resolve per-org SSO config by
     * email domain (and so the provider surfaces the right account).
     */
    loginHint?: string;
    /**
     * When true, render the button even if the env-level provider gate in
     * health is disabled. Used for multi-org shared instances where the
     * decision to show the button comes from per-org login options.
     */
    forceShow?: boolean;
    /**
     * When true, show a "Last used" badge on the button. Set when this provider
     * matches the method recorded in the last-login cookie.
     */
    lastUsed?: boolean;
    /** Fired when the (anchor) button is clicked, before navigation. */
    onClick?: () => void;
} & ButtonProps;

const ThirdPartySignInButtonBase: FC<
    {
        loginPath: string;
        logo: string | ReactNode;
        providerName: string;
        redirect?: string;
        loginHint?: string;
        lastUsed?: boolean;
        onClick?: () => void;
    } & Pick<ThirdPartySignInButtonProps, 'inviteCode' | 'intent'> &
        ButtonProps
> = ({
    loginPath,
    inviteCode,
    logo,
    providerName,
    intent,
    redirect,
    loginHint,
    lastUsed,
    ...props
}) => {
    const button = (
        <Button
            variant="default"
            color="gray"
            component="a"
            href={`/api/v1${loginPath}?redirect=${encodeURIComponent(
                redirect || window.location.href,
            )}${
                inviteCode
                    ? `&inviteCode=${encodeURIComponent(inviteCode)}`
                    : ''
            }${
                loginHint ? `&login_hint=${encodeURIComponent(loginHint)}` : ''
            }`}
            leftSection={
                typeof logo === 'string' ? (
                    <Image w={16} src={logo} alt={`${providerName} logo}`} />
                ) : (
                    logo
                )
            }
            className={classes.signInButton}
            {...props}
        >
            {intent === 'signup' && `Sign up with ${providerName}`}
            {intent === 'signin' && `Sign in with ${providerName}`}
            {intent === 'add' && 'Add +'}
        </Button>
    );

    if (!lastUsed) {
        return button;
    }

    // A small tag floating over the top edge of the button (PostHog-style) so it
    // never shifts the button's own content.
    return (
        <Box className={classes.lastUsedWrapper}>
            {button}
            <Badge
                className={classes.lastUsedBadge}
                size="sm"
                variant="default"
                radius="sm"
                tt="none"
            >
                Last used
            </Badge>
        </Box>
    );
};

export const ThirdPartySignInButton: FC<ThirdPartySignInButtonProps> = ({
    inviteCode,
    intent = 'signin',
    providerName,
    redirect,
    loginHint,
    forceShow,
    ...props
}) => {
    const { health } = useApp();

    switch (providerName) {
        case OpenIdIdentityIssuerType.GOOGLE:
            return health.data?.auth.google.enabled ? (
                <ThirdPartySignInButtonBase
                    loginPath={health.data.auth.google.loginPath}
                    redirect={redirect}
                    intent={intent}
                    inviteCode={inviteCode}
                    loginHint={loginHint}
                    providerName="Google"
                    logo={GOOGLE_LOGO}
                    {...props}
                />
            ) : null;

        case OpenIdIdentityIssuerType.OKTA:
            return health.data?.auth.okta.enabled || forceShow ? (
                <ThirdPartySignInButtonBase
                    loginPath={
                        health.data?.auth.okta.loginPath ?? '/login/okta'
                    }
                    redirect={redirect}
                    intent={intent}
                    inviteCode={inviteCode}
                    loginHint={loginHint}
                    providerName="Okta"
                    logo={OKTA_LOGO}
                    {...props}
                />
            ) : null;
        case OpenIdIdentityIssuerType.ONELOGIN:
            return health.data?.auth.oneLogin.enabled || forceShow ? (
                <ThirdPartySignInButtonBase
                    loginPath={
                        health.data?.auth.oneLogin.loginPath ??
                        '/login/oneLogin'
                    }
                    redirect={redirect}
                    intent={intent}
                    inviteCode={inviteCode}
                    loginHint={loginHint}
                    providerName="OneLogin"
                    logo={ONELOGIN_LOGO}
                    {...props}
                />
            ) : null;

        case OpenIdIdentityIssuerType.AZUREAD:
            return health.data?.auth.azuread.enabled || forceShow ? (
                <ThirdPartySignInButtonBase
                    loginPath={
                        health.data?.auth.azuread.loginPath ?? '/login/azuread'
                    }
                    redirect={redirect}
                    intent={intent}
                    inviteCode={inviteCode}
                    loginHint={loginHint}
                    providerName="Microsoft"
                    logo={MICROSOFT_LOGO}
                    {...props}
                />
            ) : null;
        case OpenIdIdentityIssuerType.GENERIC_OIDC:
            return health.data?.auth.oidc.enabled || forceShow ? (
                <ThirdPartySignInButtonBase
                    loginPath={
                        health.data?.auth.oidc.loginPath ?? '/login/oidc'
                    }
                    redirect={redirect}
                    intent={intent}
                    inviteCode={inviteCode}
                    loginHint={loginHint}
                    providerName="OpenID Connect"
                    logo={<MantineIcon icon={IconLock} />}
                    {...props}
                />
            ) : null;
    }
};
