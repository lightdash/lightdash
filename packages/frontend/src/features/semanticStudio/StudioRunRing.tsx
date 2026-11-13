import { assertUnreachable } from '@lightdash/common';
import { RingProgress } from '@mantine/core';
import {
    IconAlertTriangle,
    IconGitMerge,
    IconGitPullRequest,
    IconLoader2,
    IconPencil,
    type Icon,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { WRITEBACK_STEPS } from '../../ee/features/aiCopilot/components/ChatElements/ToolCalls/writebackProgress';
import { useElapsed } from '../../ee/features/aiCopilot/hooks/useWritebackProgress';
import classes from './StudioRunRing.module.css';
import { studioRunProgress, type StudioRun } from './studioRuns';

const LOOK: Record<StudioRun['kind'], { color: string; icon: Icon }> = {
    draft: { color: 'gray', icon: IconPencil },
    saving: { color: 'violet', icon: IconLoader2 },
    in_review: { color: 'blue', icon: IconGitPullRequest },
    ready: { color: 'green', icon: IconGitMerge },
    failing: { color: 'red', icon: IconAlertTriangle },
};

const Elapsed: FC<{ startedAt: string }> = ({ startedAt }) => {
    const elapsed = useElapsed(startedAt);
    return elapsed ? <span className={classes.clock}>{elapsed}</span> : null;
};

export const RunMeta: FC<{ run: StudioRun; startedAt: string | null }> = ({
    run,
    startedAt,
}) => {
    const pr = (n: string | null) => (n ? ` #${n}` : '');
    switch (run.kind) {
        case 'draft':
            return <>Proposed, not saved yet</>;
        case 'saving':
            return (
                <>
                    {WRITEBACK_STEPS[run.step] ?? 'Saving'}
                    {startedAt ? (
                        <>
                            {' · '}
                            <Elapsed startedAt={startedAt} />
                        </>
                    ) : null}
                </>
            );
        case 'in_review':
            return (
                <>
                    In review{pr(run.pullRequestNumber)}
                    {run.checks === 'running'
                        ? ' · checks running'
                        : run.checks === 'passed'
                          ? ' · waiting on a reviewer'
                          : null}
                </>
            );
        case 'ready':
            return <>Ready to merge{pr(run.pullRequestNumber)}</>;
        case 'failing':
            return (
                <>
                    {run.reason}
                    {pr(run.pullRequestNumber)}
                </>
            );
        default:
            return assertUnreachable(run, 'Unknown run');
    }
};

/** A ring that fills on the way to live, with what the change is doing in the middle. */
export const RunRing: FC<{ run: StudioRun; size?: number }> = ({
    run,
    size = 34,
}) => {
    const { color, icon } = LOOK[run.kind];
    return (
        <RingProgress
            size={size}
            thickness={size > 34 ? 3.5 : 3}
            roundCaps
            rootColor="var(--mantine-color-default-border)"
            sections={[{ value: studioRunProgress(run), color }]}
            label={
                <span className={classes.ringIcon} data-kind={run.kind}>
                    <MantineIcon icon={icon} size={size > 34 ? 16 : 14} />
                </span>
            }
        />
    );
};
