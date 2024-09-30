import {
    OpenIdIdentityIssuerType,
    type OpenIdIdentitySummary,
} from '@lightdash/common';
import { Button, Image, type ButtonProps } from '@mantine/core';
import { IconLock } from '@tabler/icons-react';
import { type FC } from 'react';
import { useApp } from '../../../providers/AppProvider';
import MantineIcon from '../MantineIcon';

type ThirdPartySignInButtonProps = {
    inviteCode?: string;
    intent?: 'signin' | 'add' | 'signup';
    providerName: OpenIdIdentitySummary['issuerType'];
    // Default redirect is the current window.location.href
    redirect?: string;
} & ButtonProps;

const ThirdPartySignInButtonBase: FC<
    {
        loginPath: string;
        logo: string | JSX.Element;
        providerName: string;
        redirect?: string;
    } & Pick<ThirdPartySignInButtonProps, 'inviteCode' | 'intent'> &
        ButtonProps
> = ({
    loginPath,
    inviteCode,
    logo,
    providerName,
    intent,
    redirect,
    ...props
}) => {
    return (
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
            }`}
            leftIcon={
                typeof logo === 'string' ? (
                    <Image
                        width={16}
                        src={logo}
                        alt={`${providerName} logo}`}
                    />
                ) : (
                    logo
                )
            }
            sx={{ ':hover': { textDecoration: 'underline' } }}
            {...props}
        >
            {intent === 'signup' && `Sign up with ${providerName}`}
            {intent === 'signin' && `Sign in with ${providerName}`}
            {intent === 'add' && 'Add +'}
        </Button>
    );
};

export const ThirdPartySignInButton: FC<ThirdPartySignInButtonProps> = ({
    inviteCode,
    intent = 'signin',
    providerName,
    redirect,
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
                    providerName="Google"
                    logo="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGcgZmlsbD0ibm9uZSIgZmlsbC1ydWxlPSJldmVub2RkIj48cGF0aCBkPSJNMTcuNiA5LjJsLS4xLTEuOEg5djMuNGg0LjhDMTMuNiAxMiAxMyAxMyAxMiAxMy42djIuMmgzYTguOCA4LjggMCAwIDAgMi42LTYuNnoiIGZpbGw9IiM0Mjg1RjQiIGZpbGwtcnVsZT0ibm9uemVybyIvPjxwYXRoIGQ9Ik05IDE4YzIuNCAwIDQuNS0uOCA2LTIuMmwtMy0yLjJhNS40IDUuNCAwIDAgMS04LTIuOUgxVjEzYTkgOSAwIDAgMCA4IDV6IiBmaWxsPSIjMzRBODUzIiBmaWxsLXJ1bGU9Im5vbnplcm8iLz48cGF0aCBkPSJNNCAxMC43YTUuNCA1LjQgMCAwIDEgMC0zLjRWNUgxYTkgOSAwIDAgMCAwIDhsMy0yLjN6IiBmaWxsPSIjRkJCQzA1IiBmaWxsLXJ1bGU9Im5vbnplcm8iLz48cGF0aCBkPSJNOSAzLjZjMS4zIDAgMi41LjQgMy40IDEuM0wxNSAyLjNBOSA5IDAgMCAwIDEgNWwzIDIuNGE1LjQgNS40IDAgMCAxIDUtMy43eiIgZmlsbD0iI0VBNDMzNSIgZmlsbC1ydWxlPSJub256ZXJvIi8+PHBhdGggZD0iTTAgMGgxOHYxOEgweiIvPjwvZz48L3N2Zz4="
                    {...props}
                />
            ) : null;

        case OpenIdIdentityIssuerType.OKTA:
            return health.data?.auth.okta.enabled ? (
                <ThirdPartySignInButtonBase
                    loginPath={health.data.auth.okta.loginPath}
                    redirect={redirect}
                    intent={intent}
                    inviteCode={inviteCode}
                    providerName="Okta"
                    logo="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCI+PHBhdGggZD0iTTMyIDBDMTQuMzcgMCAwIDE0LjI2NyAwIDMyczE0LjI2OCAzMiAzMiAzMiAzMi0xNC4yNjggMzItMzJTNDkuNjMgMCAzMiAwem0wIDQ4Yy04Ljg2NiAwLTE2LTcuMTM0LTE2LTE2czcuMTM0LTE2IDE2LTE2IDE2IDcuMTM0IDE2IDE2LTcuMTM0IDE2LTE2IDE2eiIgZmlsbD0iIzAwN2RjMSIvPjwvc3ZnPg=="
                    {...props}
                />
            ) : null;
        case OpenIdIdentityIssuerType.ONELOGIN:
            return health.data?.auth.oneLogin.enabled ? (
                <ThirdPartySignInButtonBase
                    loginPath={health.data.auth.oneLogin.loginPath}
                    redirect={redirect}
                    intent={intent}
                    inviteCode={inviteCode}
                    providerName="OneLogin"
                    logo="data:image/png;base64,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"
                    {...props}
                />
            ) : null;

        case OpenIdIdentityIssuerType.AZUREAD:
            return health.data?.auth.azuread.enabled ? (
                <ThirdPartySignInButtonBase
                    loginPath={health.data.auth.azuread.loginPath}
                    redirect={redirect}
                    intent={intent}
                    inviteCode={inviteCode}
                    providerName="Microsoft"
                    logo="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAApgAAAKYB3X3/OAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAACCSURBVEiJ7ZSxDcJAEATnTxd8CBlNkJK/CFwAETW4QV4EbsEd0ASBg5eOFlZIDizdxrs7J5205Xu/vYAJQVGsPecLwKL4gW5q+Z+abMdyABKQgASAR7GmmsfYVgcGyBm/Pt76OdvgczoDVY54CXm4iOoNKljImeM/OQEJOAig79jff9AUF4fE3EHkAAAAAElFTkSuQmCC"
                    {...props}
                />
            ) : null;
        case OpenIdIdentityIssuerType.GENERIC_OIDC:
            return health.data?.auth.oidc.enabled ? (
                <ThirdPartySignInButtonBase
                    loginPath={health.data.auth.oidc.loginPath}
                    redirect={redirect}
                    intent={intent}
                    inviteCode={inviteCode}
                    providerName="OpenID Connect"
                    logo={<MantineIcon icon={IconLock} />}
                    {...props}
                />
            ) : null;
    }
};
