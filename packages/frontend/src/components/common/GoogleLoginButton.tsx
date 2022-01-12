import { AnchorButton } from '@blueprintjs/core';
import React from 'react';
import { useApp } from '../../providers/AppProvider';

export const GoogleLoginButton: React.FC = () => {
    const { health } = useApp();

    if (!health.data) {
        return null;
    }

    return (
        <AnchorButton href={`/api/v1${health.data.auth.google.loginPath}`}>
            Sign in with Google
        </AnchorButton>
    );
};
