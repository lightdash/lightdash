import { Text } from '@mantine/core';
import {
    IconAlertTriangle,
    IconBox,
    IconCheck,
    IconGitBranch,
    IconGitPullRequest,
    IconSparkles,
    type Icon,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import {
    useElapsed,
    useStepTimes,
    useWritebackProgress,
    type WritebackProgress,
} from '../../../hooks/useWritebackProgress';
import {
    formatDuration,
    stepDuration,
    WRITEBACK_STEPS,
} from './writebackProgress';
import classes from './WritebackProgressCard.module.css';

const STEP_ICONS: Record<(typeof WRITEBACK_STEPS)[number], Icon> = {
    'Setting up': IconBox,
    'Copying your project': IconGitBranch,
    'Making the change': IconSparkles,
    'Opening the pull request': IconGitPullRequest,
};

type SegmentState = 'done' | 'now' | 'stopped' | 'todo';

const segmentStateOf = (
    { step, state }: WritebackProgress,
    index: number,
): SegmentState => {
    if (index < step) return 'done';
    if (index > step) return 'todo';
    return state === 'stopped' ? 'stopped' : 'now';
};

/** One bar per step: filled when done, shimmering while it runs. */
export const WritebackSegments: FC<{
    progress: WritebackProgress;
    size?: 'sm' | 'md';
}> = ({ progress, size = 'md' }) => (
    <span
        className={classes.segments}
        data-size={size}
        data-finished={progress.state === 'done'}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={WRITEBACK_STEPS.length}
        aria-valuenow={Math.min(progress.step, WRITEBACK_STEPS.length)}
    >
        {WRITEBACK_STEPS.map((label, index) => (
            <span
                key={label}
                className={classes.segment}
                data-state={segmentStateOf(progress, index)}
            />
        ))}
    </span>
);

const STATUS_LABEL: Record<WritebackProgress['state'], string> = {
    running: 'Running',
    done: 'Saved',
    stopped: 'Stopped',
};

/** A dbt change running in the background, live: the step it is on, the steps behind it and how long each took. */
export const WritebackProgressCard: FC<{
    projectUuid: string;
    aiWritebackRunUuid: string;
    startedAt: string | null;
}> = ({ projectUuid, aiWritebackRunUuid, startedAt }) => {
    const progress = useWritebackProgress(projectUuid, aiWritebackRunUuid);
    const times = useStepTimes(progress, startedAt);
    const elapsed = useElapsed(progress.state === 'running' ? startedAt : null);
    const { step, state } = progress;
    const current = Math.min(step, WRITEBACK_STEPS.length - 1);
    const currentStart = times.startedAt[current];
    const stepElapsed = useElapsed(
        state === 'running' && currentStart
            ? new Date(currentStart).toISOString()
            : null,
    );
    const CurrentIcon =
        state === 'stopped'
            ? IconAlertTriangle
            : STEP_ICONS[WRITEBACK_STEPS[current]];
    const finished = WRITEBACK_STEPS.slice(0, step).map((label, index) => ({
        label,
        index,
        took: stepDuration(times, index),
    }));
    return (
        <section
            className={classes.card}
            data-state={state}
            aria-label="Saving the change"
        >
            <header className={classes.header}>
                <span className={classes.tile}>
                    <MantineIcon icon={IconGitPullRequest} size={16} />
                </span>
                <span className={classes.title}>
                    <Text fz="sm" fw={600} truncate>
                        {state === 'done'
                            ? 'Change saved'
                            : state === 'stopped'
                              ? 'The change stopped'
                              : 'Saving your change'}
                    </Text>
                    <Text fz="xs" c="dimmed" truncate>
                        dbt project, through a pull request
                    </Text>
                </span>
                {elapsed ? (
                    <Text fz="xs" c="dimmed" ff="monospace">
                        {elapsed}
                    </Text>
                ) : null}
                <span className={classes.status} data-state={state}>
                    <span className={classes.statusDot} />
                    {STATUS_LABEL[state]}
                </span>
            </header>

            {state === 'done' ? null : (
                <div className={classes.now} data-state={state}>
                    <span className={classes.nowIcon}>
                        <MantineIcon icon={CurrentIcon} size={14} />
                    </span>
                    <Text
                        fz="sm"
                        fw={500}
                        truncate
                        className={classes.nowLabel}
                    >
                        {state === 'stopped'
                            ? `Stopped while ${WRITEBACK_STEPS[current].toLowerCase()}`
                            : WRITEBACK_STEPS[current]}
                    </Text>
                    {stepElapsed ? (
                        <Text fz="xs" c="dimmed" ff="monospace">
                            {stepElapsed}
                        </Text>
                    ) : null}
                </div>
            )}

            <WritebackSegments progress={progress} />

            {finished.length > 0 ? (
                <ol className={classes.finished} aria-label="Finished steps">
                    {finished.reverse().map(({ label, index, took }, age) => (
                        <li
                            key={label}
                            className={classes.finishedStep}
                            data-age={Math.min(age, 3)}
                        >
                            <span className={classes.finishedIcon}>
                                <MantineIcon
                                    icon={STEP_ICONS[WRITEBACK_STEPS[index]]}
                                    size={12}
                                />
                            </span>
                            <Text fz="xs" truncate className={classes.nowLabel}>
                                {label}
                            </Text>
                            {took !== null ? (
                                <Text fz="xs" c="dimmed" ff="monospace">
                                    {formatDuration(took)}
                                </Text>
                            ) : (
                                <MantineIcon
                                    icon={IconCheck}
                                    size={12}
                                    color="green"
                                />
                            )}
                        </li>
                    ))}
                </ol>
            ) : null}

            <footer className={classes.footer}>
                <Text fz="xs" c="dimmed">
                    {state === 'running'
                        ? 'Usually 2 to 3 minutes. You can leave this page; the pull request shows up here when it is ready.'
                        : state === 'stopped'
                          ? 'No pull request was opened. Ask again to retry.'
                          : 'The pull request is ready.'}
                </Text>
                <Text fz="xs" c="dimmed" ff="monospace">
                    {Math.min(
                        step + (state === 'running' ? 1 : 0),
                        WRITEBACK_STEPS.length,
                    )}
                    /{WRITEBACK_STEPS.length}
                </Text>
            </footer>
        </section>
    );
};
