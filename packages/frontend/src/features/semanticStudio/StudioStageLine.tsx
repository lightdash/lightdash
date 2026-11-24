import { assertUnreachable } from '@lightdash/common';
import { Tooltip } from '@mantine/core';
import { IconArrowUpRight } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { STUDIO_STEPS, type StudioStage } from './studioStage';
import classes from './StudioStageLine.module.css';

type StepState = 'done' | 'now' | 'busy' | 'stopped' | 'todo';

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
            switch (stage.update) {
                case 'running':
                    return {
                        index: 3,
                        label: 'Merged. Updating for everyone',
                        state: 'busy',
                    };
                case 'failed':
                    return {
                        index: 3,
                        label: 'Merged, but the update failed',
                        state: 'stopped',
                    };
                case 'done':
                    return {
                        index: 3,
                        label: 'Published for everyone',
                        state: 'done',
                    };
                case 'unknown':
                    return { index: 3, label: 'Merged', state: 'done' };
                default:
                    return assertUnreachable(stage.update, 'Unknown update');
            }
        default:
            return assertUnreachable(stage, 'Unknown stage');
    }
};

/** The current step as one quiet label; the whole path is a dot per step, spelled out on hover. */
export const StudioStageLine: FC<{
    stage: StudioStage;
    /** Its pull request, so the stage is also the way to it. */
    href: string | null;
}> = ({ stage, href }) => {
    const { index, label, state } = positionOf(stage);
    // A closed change has nowhere left to go, so its path ends where it stopped.
    const steps = STUDIO_STEPS.slice(
        0,
        state === 'stopped' ? index + 1 : undefined,
    );
    const stateOf = (i: number): StepState =>
        i < index ? 'done' : i === index ? state : 'todo';
    // An ended change needs only its label; the path stays in the tooltip.
    const isEnded = state === 'done' || state === 'stopped';
    const dots = isEnded ? null : (
        <span className={classes.dots} aria-hidden>
            {steps.map((name, i) => (
                <span
                    key={name}
                    className={classes.dot}
                    data-state={stateOf(i)}
                />
            ))}
        </span>
    );
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
            {href ? (
                <a
                    className={classes.stage}
                    data-state={state}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Stage: ${label}. Open the pull request`}
                >
                    {dots}
                    {label}
                    <MantineIcon icon={IconArrowUpRight} size={12} />
                </a>
            ) : (
                <span
                    className={classes.stage}
                    data-state={state}
                    aria-label={`Stage: ${label}`}
                >
                    {dots}
                    {label}
                </span>
            )}
        </Tooltip>
    );
};
