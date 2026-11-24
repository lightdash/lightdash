import { canAgentFixRejection } from '@lightdash/common';
import { Button } from '@mantine/core';
import { type ReactNode } from 'react';
import { Link } from 'react-router';
import { type Issue } from './proposalIssues';

/** Hands a failure to the agent in this chat; nothing while it is busy. */
const fixAction = (
    message: string,
    onAsk: ((message: string) => void) | null,
): ReactNode =>
    onAsk ? (
        <Button key="fix" size="compact-xs" onClick={() => onAsk(message)}>
            Fix with agent
        </Button>
    ) : null;

/** Hands the first model the agent could not add back to it, unless no change of its can fix why. */
export const fixFailureAction = (
    issues: Issue[],
    onAsk: ((message: string) => void) | null,
): ReactNode => {
    const failure = issues.find(
        ({ kind, rejection }) =>
            kind === 'failed' &&
            (rejection === null || canAgentFixRejection(rejection.kind)),
    );
    if (!failure) return null;
    const why =
        failure.rejection === null
            ? `${failure.detail}.`
            : [failure.detail, failure.rejection.detail]
                  .filter(Boolean)
                  .join(' ');
    return fixAction(`${failure.model} was not added: ${why} Fix it.`, onAsk);
};

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
