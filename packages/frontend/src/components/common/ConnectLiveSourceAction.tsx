import { Button, type ButtonProps } from '@mantine/core';
import { type FC } from 'react';
import { useLocation } from 'react-router';
import { getLiveSourceSignIn, type QueryError } from './liveSourceSignInError';

type Props = ButtonProps & { error: QueryError };

/**
 * Sends the viewer to sign in to a live source that shows each person their
 * own data, then back to this page. Renders nothing for any other error.
 */
export const ConnectLiveSourceAction: FC<Props> = ({ error, ...rest }) => {
    const { pathname, search } = useLocation();
    const signIn = getLiveSourceSignIn(error);
    if (!signIn) return null;

    // Only the path is trusted: the link always stays in this app
    const href = new URL(
        new URL(signIn.connectUrl).pathname,
        window.location.origin,
    );
    href.searchParams.set('returnTo', `${pathname}${search}`);

    return (
        <Button
            size="xs"
            variant="default"
            component="a"
            href={href.toString()}
            {...rest}
        >
            {signIn.reason === 'expired'
                ? `Reconnect your ${signIn.integration} account`
                : `Connect your ${signIn.integration} account`}
        </Button>
    );
};
