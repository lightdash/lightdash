import React from 'react';
import { useFlashMessages } from '../../../hooks/useFlashMessages';
import { useApp } from '../../../providers/AppProvider';
import { GoogleLoginWrapper } from './GoogleLoginButton.styles';

export const GoogleLoginButton: React.FC<{ inviteCode?: string }> = ({
    inviteCode,
}) => {
    const { health, showToastError } = useApp();
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
            Sign in with Google
        </GoogleLoginWrapper>
    );
};
