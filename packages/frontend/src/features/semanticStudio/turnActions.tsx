import { Button } from '@mantine/core';
import { type ReactNode } from 'react';
import { Link } from 'react-router';
import { Task } from './TaskRow';

export type Trial = 'idle' | 'trying' | 'tried';

/** In your draft → Try → publish, for a turn whose changes are still in the draft. */
export const draftSteps = ({
    failed,
    trial,
    publishLabel,
}: {
    failed: boolean;
    trial: Trial;
    publishLabel: string;
}): ReactNode[] => [
    <Task key="draft" state="done" label="In your draft" />,
    <Task
        key="try"
        state={
            failed
                ? 'failed'
                : trial === 'trying'
                  ? 'running'
                  : trial === 'tried'
                    ? 'done'
                    : 'todo'
        }
        label={trial === 'tried' ? 'Tried' : 'Try'}
    />,
    <Task key="publish" state="todo" label={publishLabel} />,
];

/** The next thing to do with a drafted turn: fix it, look at it, try it, then publish it. */
export const draftActions = ({
    error,
    isBusy,
    trial,
    canTry,
    canPublish,
    publishLabel,
    reviewTo,
    onAsk,
    onTry,
    onPublish,
}: {
    error: string | null;
    /** Checks still running or something breaks, so looking comes before trying. */
    isBusy: boolean;
    trial: Trial;
    canTry: boolean;
    canPublish: boolean;
    publishLabel: string;
    reviewTo: string;
    onAsk: ((message: string) => void) | null;
    onTry: () => void;
    onPublish: () => void;
}): ReactNode[] => {
    const viewChanges = (primary: boolean) => (
        <Button
            key="view"
            size="compact-xs"
            variant={primary ? 'filled' : 'subtle'}
            component={Link}
            to={reviewTo}
        >
            View changes
        </Button>
    );
    const tryIt = (primary: boolean) =>
        canTry ? (
            <Button
                key="try"
                size="compact-xs"
                variant={primary ? 'filled' : 'subtle'}
                onClick={onTry}
            >
                {trial === 'tried' ? 'Try again' : 'Try it'}
            </Button>
        ) : null;
    if (error) {
        return [
            viewChanges(!onAsk),
            onAsk ? (
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
    }
    if (isBusy) return [tryIt(false), viewChanges(true)];
    if (trial === 'tried' && canPublish) {
        return [
            viewChanges(false),
            tryIt(false),
            <Button key="publish" size="compact-xs" onClick={onPublish}>
                {publishLabel}
            </Button>,
        ];
    }
    return [viewChanges(false), tryIt(true)];
};
