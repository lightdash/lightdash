import { assertUnreachable } from '@lightdash/common';
import { IconCheck, IconX } from '@tabler/icons-react';
import { Fragment, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import classes from './StudioStageLine.module.css';

/** Where a workspace's changes stand, from first proposed to live. */
export type StudioStage =
    | { step: 'proposed' }
    | { step: 'saving' }
    | { step: 'in_review'; pullRequestNumber: string | null }
    | { step: 'closed'; pullRequestNumber: string | null }
    | { step: 'live' };

const STEPS = ['Proposed', 'Saved', 'In review', 'Live'] as const;

const positionOf = (
    stage: StudioStage,
): { index: number; label: string; state: 'now' | 'busy' | 'stopped' } => {
    switch (stage.step) {
        case 'proposed':
            return { index: 0, label: 'Proposed', state: 'now' };
        case 'saving':
            return { index: 1, label: 'Saving', state: 'busy' };
        case 'in_review':
            return {
                index: 2,
                label: stage.pullRequestNumber
                    ? `In review #${stage.pullRequestNumber}`
                    : 'In review',
                state: 'now',
            };
        case 'closed':
            return {
                index: 2,
                label: stage.pullRequestNumber
                    ? `Closed #${stage.pullRequestNumber}`
                    : 'Closed',
                state: 'stopped',
            };
        case 'live':
            return { index: 4, label: 'Live', state: 'now' };
        default:
            return assertUnreachable(stage, 'Unknown stage');
    }
};

export const StudioStageLine: FC<{ stage: StudioStage }> = ({ stage }) => {
    const { index, label, state } = positionOf(stage);
    return (
        <span className={classes.stages} aria-label={`Stage: ${label}`}>
            {STEPS.map((name, i) => {
                const stepState =
                    i < index ? 'done' : i === index ? state : 'todo';
                return (
                    <Fragment key={name}>
                        {i > 0 ? (
                            <span
                                className={classes.line}
                                data-done={i <= index}
                            />
                        ) : null}
                        <span className={classes.stage} data-state={stepState}>
                            <span className={classes.dot}>
                                {stepState === 'done' ? (
                                    <MantineIcon icon={IconCheck} size={9} />
                                ) : stepState === 'stopped' ? (
                                    <MantineIcon icon={IconX} size={9} />
                                ) : null}
                            </span>
                            {i === index ? label : name}
                        </span>
                    </Fragment>
                );
            })}
        </span>
    );
};
