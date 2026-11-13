import {
    assertUnreachable,
    type SemanticStudioWorkspace,
} from '@lightdash/common';
import {
    Button,
    Popover,
    RingProgress,
    Text,
    UnstyledButton,
} from '@mantine/core';
import {
    IconAlertTriangle,
    IconChevronRight,
    IconGitMerge,
    IconGitPullRequest,
    IconLoader2,
    IconPencil,
    type Icon,
} from '@tabler/icons-react';
import { useQueries } from '@tanstack/react-query';
import { useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { WRITEBACK_STEPS } from '../../ee/features/aiCopilot/components/ChatElements/ToolCalls/writebackProgress';
import { type StudioPendingChange } from '../../ee/features/aiCopilot/components/SemanticStudioAgent/useStudioPullRequest';
import { pullRequestCiChecksQuery } from '../../ee/features/aiCopilot/hooks/usePullRequestCiChecks';
import {
    useElapsed,
    useWritebackProgress,
} from '../../ee/features/aiCopilot/hooks/useWritebackProgress';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import classes from './StudioRunningPill.module.css';
import {
    isInFlight,
    needsYou,
    studioRunProgress,
    summarizeStudioRuns,
    toStudioRun,
    type StudioRun,
} from './studioRuns';

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

const RunMeta: FC<{ run: StudioRun; startedAt: string | null }> = ({
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

type Row = { workspace: SemanticStudioWorkspace; run: StudioRun };

const RunRow: FC<{
    row: Row;
    startedAt: string | null;
    onOpen: () => void;
}> = ({ row: { workspace, run }, startedAt, onOpen }) => {
    const { color, icon } = LOOK[run.kind];
    return (
        <UnstyledButton
            className={classes.row}
            data-current={workspace.isActive || undefined}
            onClick={onOpen}
        >
            <RingProgress
                size={34}
                thickness={3}
                roundCaps
                rootColor="var(--mantine-color-default-border)"
                sections={[{ value: studioRunProgress(run), color }]}
                label={
                    <span className={classes.ringIcon} data-kind={run.kind}>
                        <MantineIcon icon={icon} size={14} />
                    </span>
                }
            />
            <span className={classes.rowText}>
                <Text component="span" className={classes.name}>
                    {workspace.name}
                </Text>
                <span className={classes.meta} data-kind={run.kind}>
                    <RunMeta
                        run={run}
                        startedAt={run.kind === 'saving' ? startedAt : null}
                    />
                </span>
            </span>
            {needsYou(run) ? (
                <Button
                    component="span"
                    size="compact-xs"
                    variant="light"
                    color={color}
                >
                    Open
                </Button>
            ) : (
                <MantineIcon
                    icon={IconChevronRight}
                    size={14}
                    className={classes.chevron}
                />
            )}
        </UnstyledButton>
    );
};

/** Your work in flight across workspaces, with the ones waiting on you up top. */
export const StudioRunningPill: FC<{
    projectUuid: string;
    workspaces: SemanticStudioWorkspace[];
    saving: StudioPendingChange | null;
    onOpen: (workspace: SemanticStudioWorkspace) => void;
}> = ({ projectUuid, workspaces, saving, onOpen }) => {
    const [opened, setOpened] = useState(false);
    const lightdashApi = useLightdashApi();
    const inFlight = workspaces.filter(isInFlight);
    const ciChecks = useQueries({
        queries: inFlight.map((workspace) =>
            pullRequestCiChecksQuery(
                lightdashApi,
                projectUuid,
                workspace.pullRequest?.url,
                null,
            ),
        ),
    });
    const progress = useWritebackProgress(
        projectUuid,
        saving?.aiWritebackRunUuid ?? null,
    );
    const rows: Row[] = inFlight.map((workspace, index) => ({
        workspace,
        run: toStudioRun(workspace, {
            savingStep:
                saving && workspace.isActive && progress.state === 'running'
                    ? progress.step
                    : null,
            ciChecks: ciChecks[index]?.data ?? null,
        }),
    }));
    if (rows.length === 0) return null;
    const runs = rows.map(({ run }) => run);
    const waiting = rows.filter(({ run }) => needsYou(run));
    const going = rows.filter(({ run }) => !needsYou(run));
    const activity = summarizeStudioRuns(going.map(({ run }) => run));
    const isBusy = runs.some(
        (run) =>
            run.kind === 'saving' ||
            (run.kind === 'in_review' && run.checks === 'running'),
    );
    const open = (workspace: SemanticStudioWorkspace) => {
        setOpened(false);
        onOpen(workspace);
    };
    const section = (label: string, list: Row[]) =>
        list.length > 0 ? (
            <div className={classes.section}>
                <Text className={classes.sectionLabel}>{label}</Text>
                {list.map((row) => (
                    <RunRow
                        key={row.workspace.workspaceUuid}
                        row={row}
                        startedAt={saving?.startedAt ?? null}
                        onOpen={() => open(row.workspace)}
                    />
                ))}
            </div>
        ) : null;
    return (
        <Popover
            opened={opened}
            onChange={setOpened}
            position="bottom-end"
            width={360}
            shadow="md"
            radius="md"
            offset={6}
        >
            <Popover.Target>
                <UnstyledButton
                    className={classes.pill}
                    data-opened={opened || undefined}
                    aria-label={`Your work: ${summarizeStudioRuns(runs)}`}
                    onClick={() => setOpened((o) => !o)}
                >
                    {activity ? (
                        <span className={classes.activity}>
                            <span
                                className={classes.liveDot}
                                data-busy={isBusy || undefined}
                            />
                            {activity}
                        </span>
                    ) : null}
                    {waiting.length > 0 ? (
                        <span className={classes.needs}>
                            <span className={classes.needsDot} />
                            {waiting.length} needs you
                        </span>
                    ) : null}
                </UnstyledButton>
            </Popover.Target>
            <Popover.Dropdown className={classes.dropdown}>
                <div className={classes.head}>
                    <Text fz="sm" fw={600}>
                        Your work
                    </Text>
                    <Text fz="xs" c="dimmed">
                        {rows.length} in flight
                    </Text>
                </div>
                {section('Needs you', waiting)}
                {section('Running', going)}
            </Popover.Dropdown>
        </Popover>
    );
};
