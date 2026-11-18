import { Button } from '@mantine/core';
import { type ReactNode } from 'react';
import { Link } from 'react-router';

/** What a drafted turn's card offers: a look at its changes, and a fix when it does not compile. The toolbar tries and publishes. */
export const draftActions = ({
    error,
    reviewTo,
    onAsk,
}: {
    error: string | null;
    reviewTo: string;
    onAsk: ((message: string) => void) | null;
}): ReactNode[] => [
    <Button
        key="view"
        size="compact-xs"
        variant={error && onAsk ? 'subtle' : 'default'}
        component={Link}
        to={reviewTo}
    >
        View changes
    </Button>,
    error && onAsk ? (
        <Button
            key="fix"
            size="compact-xs"
            onClick={() =>
                onAsk(`The draft doesn't compile: ${error}. Fix it.`)
            }
        >
            Fix with agent
        </Button>
    ) : null,
];
