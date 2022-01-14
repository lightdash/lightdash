import { AnchorButton } from '@blueprintjs/core';
import React from 'react';
import { useFlashMessages } from '../../hooks/useFlashMessages';
import { useApp } from '../../providers/AppProvider';

export const GoogleLoginButton: React.FC = () => {
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
        <AnchorButton
            href={`/api/v1${
                health.data.auth.google.loginPath
            }?redirect=${encodeURIComponent(window.location.href)}`}
        >
            Sign in with Google
        </AnchorButton>
    );
};
