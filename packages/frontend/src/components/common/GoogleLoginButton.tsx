import React from 'react';
import { useFlashMessages } from '../../hooks/useFlashMessages';
import { useApp } from '../../providers/AppProvider';

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
        <a
            href={`/api/v1${
                health.data.auth.google.loginPath
            }?redirect=${encodeURIComponent(window.location.href)}${
                inviteCode
                    ? `&inviteCode=${encodeURIComponent(inviteCode)}`
                    : ''
            }`}
            style={{
                padding: '12px 16px 12px 42px',
                border: 'none',
                borderRadius: '3px',
                boxShadow:
                    '0 -1px 0 rgba(0, 0, 0, .04), 0 1px 1px rgba(0, 0, 0, .25)',
                color: '#757575',
                fontSize: '14px',
                fontWeight: 500,
                fontFamily:
                    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen,Ubuntu,Cantarell,"Fira Sans","Droid Sans","Helvetica Neue",sans-serif',
                backgroundImage:
                    'url(data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGcgZmlsbD0ibm9uZSIgZmlsbC1ydWxlPSJldmVub2RkIj48cGF0aCBkPSJNMTcuNiA5LjJsLS4xLTEuOEg5djMuNGg0LjhDMTMuNiAxMiAxMyAxMyAxMiAxMy42djIuMmgzYTguOCA4LjggMCAwIDAgMi42LTYuNnoiIGZpbGw9IiM0Mjg1RjQiIGZpbGwtcnVsZT0ibm9uemVybyIvPjxwYXRoIGQ9Ik05IDE4YzIuNCAwIDQuNS0uOCA2LTIuMmwtMy0yLjJhNS40IDUuNCAwIDAgMS04LTIuOUgxVjEzYTkgOSAwIDAgMCA4IDV6IiBmaWxsPSIjMzRBODUzIiBmaWxsLXJ1bGU9Im5vbnplcm8iLz48cGF0aCBkPSJNNCAxMC43YTUuNCA1LjQgMCAwIDEgMC0zLjRWNUgxYTkgOSAwIDAgMCAwIDhsMy0yLjN6IiBmaWxsPSIjRkJCQzA1IiBmaWxsLXJ1bGU9Im5vbnplcm8iLz48cGF0aCBkPSJNOSAzLjZjMS4zIDAgMi41LjQgMy40IDEuM0wxNSAyLjNBOSA5IDAgMCAwIDEgNWwzIDIuNGE1LjQgNS40IDAgMCAxIDUtMy43eiIgZmlsbD0iI0VBNDMzNSIgZmlsbC1ydWxlPSJub256ZXJvIi8+PHBhdGggZD0iTTAgMGgxOHYxOEgweiIvPjwvZz48L3N2Zz4=)',
                backgroundColor: 'white',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: '12px 11px',
            }}
        >
            Sign in with Google
        </a>
    );
};
