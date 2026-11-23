import { Button, type ButtonProps } from '@mantine/core';
import { type FC } from 'react';
import { useLocation } from 'react-router';
import { getLiveSourceSignIn, type QueryError } from './liveSourceSignInError';

type Props = ButtonProps & { error: QueryError };

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const START_PATH = new RegExp(
    `^/api/v1/ee/projects/(${UUID})/live-sources/(${UUID})/user-sign-in/start$`,
    'i',
);

/** This app's own sign-in start for the source a connect link names. */
const getStartUrl = (connectUrl: string): URL | null => {
    let ids: RegExpExecArray | null;
    try {
        ids = START_PATH.exec(new URL(connectUrl).pathname);
    } catch {
        return null;
    }
    if (!ids) return null;
    return new URL(
        `${window.location.origin}/api/v1/ee/projects/${ids[1]}/live-sources/${ids[2]}/user-sign-in/start`,
    );
};

/**
 * Sends the viewer to sign in to a live source that shows each person their
 * own data, then back to this page. Renders nothing for any other error.
 */
export const ConnectLiveSourceAction: FC<Props> = ({ error, ...rest }) => {
    const { pathname, search } = useLocation();
    const signIn = getLiveSourceSignIn(error);
    if (!signIn) return null;

    // Only the project and source ids are read from the link, so it always
    // stays in this app whatever the error text says
    const href = getStartUrl(signIn.connectUrl);
    if (!href) return null;
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
