import React from 'react';
import useToaster from '../../../hooks/toaster/useToaster';
import { useFlashMessages } from '../../../hooks/useFlashMessages';
import { useApp } from '../../../providers/AppProvider';
import {
    GoogleLoginWrapper,
    GoogleLogo,
    LinkContent,
} from './GoogleLoginButton.styles';

export const GoogleLoginButton: React.FC<{ inviteCode?: string }> = ({
    inviteCode,
}) => {
    const { health } = useApp();
    const { showToastError } = useToaster();
    const flashMessages = useFlashMessages();

    if (!health.data?.auth.google.oauth2ClientId) {
        return null;
    }

    if (flashMessages.data?.error) {
        showToastError({
            title: 'Failed to authenticate',
            subtitle: flashMessages.data.error.join('\n'),
        });
    }

    return (
        <GoogleLoginWrapper
            href={`/api/v1${
                health.data.auth.google.loginPath
            }?redirect=${encodeURIComponent(window.location.href)}${
                inviteCode
                    ? `&inviteCode=${encodeURIComponent(inviteCode)}`
                    : ''
            }`}
        >
            <LinkContent>
                <GoogleLogo
                    src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGcgZmlsbD0ibm9uZSIgZmlsbC1ydWxlPSJldmVub2RkIj48cGF0aCBkPSJNMTcuNiA5LjJsLS4xLTEuOEg5djMuNGg0LjhDMTMuNiAxMiAxMyAxMyAxMiAxMy42djIuMmgzYTguOCA4LjggMCAwIDAgMi42LTYuNnoiIGZpbGw9IiM0Mjg1RjQiIGZpbGwtcnVsZT0ibm9uemVybyIvPjxwYXRoIGQ9Ik05IDE4YzIuNCAwIDQuNS0uOCA2LTIuMmwtMy0yLjJhNS40IDUuNCAwIDAgMS04LTIuOUgxVjEzYTkgOSAwIDAgMCA4IDV6IiBmaWxsPSIjMzRBODUzIiBmaWxsLXJ1bGU9Im5vbnplcm8iLz48cGF0aCBkPSJNNCAxMC43YTUuNCA1LjQgMCAwIDEgMC0zLjRWNUgxYTkgOSAwIDAgMCAwIDhsMy0yLjN6IiBmaWxsPSIjRkJCQzA1IiBmaWxsLXJ1bGU9Im5vbnplcm8iLz48cGF0aCBkPSJNOSAzLjZjMS4zIDAgMi41LjQgMy40IDEuM0wxNSAyLjNBOSA5IDAgMCAwIDEgNWwzIDIuNGE1LjQgNS40IDAgMCAxIDUtMy43eiIgZmlsbD0iI0VBNDMzNSIgZmlsbC1ydWxlPSJub256ZXJvIi8+PHBhdGggZD0iTTAgMGgxOHYxOEgweiIvPjwvZz48L3N2Zz4="
                    alt="Google logo"
                />
                Sign in with Google
            </LinkContent>
        </GoogleLoginWrapper>
    );
};

export const OktaLoginButton: React.FC<{ inviteCode?: string }> = ({
    inviteCode,
}) => {
    const { health } = useApp();
    const { showToastError } = useToaster();
    const flashMessages = useFlashMessages();

    if (!health.data?.auth.okta.enabled) {
        return null;
    }

    // TODO: will this happen twice if two buttons mounted?
    // use in app provider?
    if (flashMessages.data?.error) {
        showToastError({
            title: 'Failed to authenticate',
            subtitle: flashMessages.data.error.join('\n'),
        });
    }

    return (
        <GoogleLoginWrapper
            href={`/api/v1${
                health.data.auth.okta.loginPath
            }?redirect=${encodeURIComponent(window.location.href)}${
                inviteCode
                    ? `&inviteCode=${encodeURIComponent(inviteCode)}`
                    : ''
            }`}
        >
            <LinkContent>
                <GoogleLogo
                    src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCI+PHBhdGggZD0iTTMyIDBDMTQuMzcgMCAwIDE0LjI2NyAwIDMyczE0LjI2OCAzMiAzMiAzMiAzMi0xNC4yNjggMzItMzJTNDkuNjMgMCAzMiAwem0wIDQ4Yy04Ljg2NiAwLTE2LTcuMTM0LTE2LTE2czcuMTM0LTE2IDE2LTE2IDE2IDcuMTM0IDE2IDE2LTcuMTM0IDE2LTE2IDE2eiIgZmlsbD0iIzAwN2RjMSIvPjwvc3ZnPg=="
                    alt="Okta logo"
                />
                Sign in with Okta
            </LinkContent>
        </GoogleLoginWrapper>
    );
};
