import { Button } from '@mantine/core';
import { type ReactNode } from 'react';
import { Link } from 'react-router';

/** Hands a failure to the agent in this chat; nothing while it is busy. */
export const fixAction = (
    message: string,
    onAsk: ((message: string) => void) | null,
): ReactNode =>
    onAsk ? (
        <Button key="fix" size="compact-sm" onClick={() => onAsk(message)}>
            Fix with agent
        </Button>
    ) : null;

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
        size="compact-sm"
        variant="subtle"
        color="gray"
        component={Link}
        to={reviewTo}
    >
        View changes
    </Button>,
    error
        ? fixAction(`The draft doesn't compile: ${error}. Fix it.`, onAsk)
        : null,
];
