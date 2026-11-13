import { assertUnreachable } from '@lightdash/common';
import { Tooltip } from '@mantine/core';
import { type FC } from 'react';
import classes from './StudioStageLine.module.css';

/** Where a workspace's changes stand, from first proposed to live. */
export type StudioStage =
    | { step: 'proposed' }
    | { step: 'saving' }
    | { step: 'in_review'; pullRequestNumber: string | null }
    | { step: 'closed'; pullRequestNumber: string | null }
    | { step: 'live' };

type StepState = 'done' | 'now' | 'busy' | 'stopped' | 'todo';

const STEPS = ['Proposed', 'Saved', 'In review', 'Live'] as const;

const withNumber = (label: string, pullRequestNumber: string | null) =>
    pullRequestNumber ? `${label} #${pullRequestNumber}` : label;

const positionOf = (
    stage: StudioStage,
): { index: number; label: string; state: StepState } => {
    switch (stage.step) {
        case 'proposed':
            return { index: 0, label: 'Proposed', state: 'now' };
        case 'saving':
            return { index: 1, label: 'Saving', state: 'busy' };
        case 'in_review':
            return {
                index: 2,
                label: withNumber('In review', stage.pullRequestNumber),
                state: 'now',
            };
        case 'closed':
            return {
                index: 2,
                label: withNumber('Closed', stage.pullRequestNumber),
                state: 'stopped',
            };
        case 'live':
            return { index: 3, label: 'Live', state: 'done' };
        default:
            return assertUnreachable(stage, 'Unknown stage');
    }
};

/** The current step as one quiet label; the whole path is a dot per step, spelled out on hover. */
export const StudioStageLine: FC<{ stage: StudioStage }> = ({ stage }) => {
    const { index, label, state } = positionOf(stage);
    // A closed change has nowhere left to go, so its path ends where it stopped.
    const steps = STEPS.slice(0, state === 'stopped' ? index + 1 : undefined);
    const stateOf = (i: number): StepState =>
        i < index ? 'done' : i === index ? state : 'todo';
    return (
        <Tooltip
            withinPortal
            position="bottom-start"
            label={
                <span className={classes.path}>
                    {steps.map((name, i) => (
                        <span
                            key={name}
                            className={classes.pathStep}
                            data-state={stateOf(i)}
                        >
                            <span className={classes.dot} />
                            {i === index ? label : name}
                        </span>
                    ))}
                </span>
            }
        >
            <span
                className={classes.stage}
                data-state={state}
                aria-label={`Stage: ${label}`}
            >
                <span className={classes.dots} aria-hidden>
                    {steps.map((name, i) => (
                        <span
                            key={name}
                            className={classes.dot}
                            data-state={stateOf(i)}
                        />
                    ))}
                </span>
                {label}
            </span>
        </Tooltip>
    );
};
