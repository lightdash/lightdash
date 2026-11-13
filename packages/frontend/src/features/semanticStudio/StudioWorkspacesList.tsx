import { type SemanticStudioWorkspace } from '@lightdash/common';
import { Avatar, Box, Button, Text, UnstyledButton } from '@mantine/core';
import {
    IconCheck,
    IconChevronRight,
    IconExternalLink,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { type StudioPendingChange } from '../../ee/features/aiCopilot/components/SemanticStudioAgent/useStudioPullRequest';
import { RunMeta, RunRing } from './StudioRunRing';
import { needsYou, toStudioRun, type StudioRun } from './studioRuns';
import classes from './StudioWorkspacesList.module.css';
import { pullRequestNumberOf } from './urls';
import { useStudioRuns, type StudioRunRow } from './useStudioRuns';
import { useStudioWorkspaces } from './useStudioWorkspaces';

dayjs.extend(relativeTime);

const STAGES = ['Proposed', 'Saved', 'In review', 'Live'] as const;

/** How many stages are behind the run, and the one it is on. */
const stageOf = (run: StudioRun): number => {
    switch (run.kind) {
        case 'draft':
            return 0;
        case 'saving':
            return 1;
        default:
            return 2;
    }
};

const StageTrack: FC<{ run: StudioRun }> = ({ run }) => {
    const current = stageOf(run);
    return (
        <span
            className={classes.track}
            aria-label={`Stage: ${STAGES[current]}`}
        >
            {STAGES.map((stage, index) => (
                <span
                    key={stage}
                    className={classes.segment}
                    data-state={
                        index < current
                            ? 'done'
                            : index === current
                              ? run.kind
                              : 'todo'
                    }
                />
            ))}
        </span>
    );
};

const Section: FC<{ label: string; count: number; children: ReactNode }> = ({
    label,
    count,
    children,
}) => (
    <section className={classes.section}>
        <header className={classes.sectionHead}>
            <Text className={classes.sectionLabel}>{label}</Text>
            <span className={classes.sectionCount}>{count}</span>
        </header>
        <div className={classes.list}>{children}</div>
    </section>
);

const MineRow: FC<{
    row: StudioRunRow;
    startedAt: string | null;
    onOpen: () => void;
}> = ({ row: { workspace, run }, startedAt, onOpen }) => (
    <UnstyledButton
        className={classes.row}
        data-current={workspace.isActive || undefined}
        onClick={onOpen}
    >
        <RunRing run={run} size={40} />
        <span className={classes.text}>
            <span className={classes.nameLine}>
                <Text component="span" className={classes.name}>
                    {workspace.name}
                </Text>
                {workspace.isActive ? (
                    <span className={classes.here}>You're here</span>
                ) : null}
            </span>
            <span className={classes.meta} data-kind={run.kind}>
                <RunMeta
                    run={run}
                    startedAt={run.kind === 'saving' ? startedAt : null}
                />
                <span className={classes.when}>
                    {' · '}
                    {dayjs(workspace.updatedAt).fromNow()}
                </span>
            </span>
        </span>
        <StageTrack run={run} />
        {needsYou(run) ? (
            <Button
                component="span"
                size="compact-sm"
                variant="light"
                color={run.kind === 'ready' ? 'green' : 'red'}
            >
                Open
            </Button>
        ) : (
            <MantineIcon
                icon={IconChevronRight}
                size={16}
                className={classes.chevron}
            />
        )}
    </UnstyledButton>
);

const whereItStands = ({ pullRequest }: SemanticStudioWorkspace): string => {
    const number = pullRequestNumberOf(pullRequest?.url);
    if (!pullRequest) return 'Not saved yet';
    switch (pullRequest.state) {
        case 'merged':
            return number ? `Merged as #${number}` : 'Merged';
        case 'closed':
            return number ? `Closed #${number}` : 'Closed';
        default:
            return number ? `In review #${number}` : 'In review';
    }
};

/** Your work in flight, others' (to be aware of), and what went live lately. */
export const StudioWorkspacesList: FC<{
    projectUuid: string;
    saving: StudioPendingChange | null;
    onOpen: (workspace: SemanticStudioWorkspace) => void;
}> = ({ projectUuid, saving, onOpen }) => {
    const { data, isInitialLoading, error } = useStudioWorkspaces(projectUuid);
    const rows = useStudioRuns(projectUuid, data?.mine ?? [], saving);
    if (isInitialLoading) return null;
    if (error || !data) {
        return (
            <Text fz="sm" c="dimmed" ta="center" py="xl">
                Changes could not be loaded.
            </Text>
        );
    }
    const { others, recent } = data;
    const waiting = rows.filter(({ run }) => needsYou(run));
    const going = rows.filter(({ run }) => !needsYou(run));
    const mineRow = (row: StudioRunRow) => (
        <MineRow
            key={row.workspace.workspaceUuid}
            row={row}
            startedAt={saving?.startedAt ?? null}
            onOpen={() => onOpen(row.workspace)}
        />
    );
    return (
        <Box className={classes.page}>
            <header className={classes.hero}>
                <Text className={classes.title}>Changes</Text>
                <Text className={classes.lede}>
                    Each change runs from its first proposal until it is live.
                </Text>
            </header>
            <div className={classes.stats}>
                <div className={classes.stat}>
                    <span className={classes.statValue}>{rows.length}</span>
                    <span className={classes.statLabel}>In flight</span>
                </div>
                <div
                    className={classes.stat}
                    data-tone={waiting.length > 0 ? 'attention' : undefined}
                >
                    <span className={classes.statValue}>{waiting.length}</span>
                    <span className={classes.statLabel}>Waiting on you</span>
                </div>
                <div className={classes.stat}>
                    <span className={classes.statValue}>{recent.length}</span>
                    <span className={classes.statLabel}>Live lately</span>
                </div>
            </div>
            {rows.length === 0 ? (
                <div className={classes.empty}>
                    <Text fz="sm" fw={500}>
                        Nothing in flight
                    </Text>
                    <Text fz="xs" c="dimmed">
                        Start one with New change, or ask for a change in the
                        chat.
                    </Text>
                </div>
            ) : null}
            {waiting.length > 0 ? (
                <Section label="Needs you" count={waiting.length}>
                    {waiting.map(mineRow)}
                </Section>
            ) : null}
            {going.length > 0 ? (
                <Section label="In flight" count={going.length}>
                    {going.map(mineRow)}
                </Section>
            ) : null}
            {others.length > 0 ? (
                <Section label="From others" count={others.length}>
                    {others.map((workspace) => {
                        const run = toStudioRun(workspace, {
                            savingStep: null,
                            ciChecks: null,
                        });
                        return (
                            <UnstyledButton
                                key={workspace.workspaceUuid}
                                className={classes.row}
                                disabled={!workspace.pullRequest}
                                onClick={() => {
                                    if (workspace.pullRequest) {
                                        window.open(
                                            workspace.pullRequest.url,
                                            '_blank',
                                            'noopener,noreferrer',
                                        );
                                    }
                                }}
                            >
                                <Avatar
                                    size={40}
                                    radius="xl"
                                    color="initials"
                                    name={workspace.owner.name}
                                />
                                <span className={classes.text}>
                                    <Text
                                        component="span"
                                        className={classes.name}
                                    >
                                        {workspace.name}
                                    </Text>
                                    <span className={classes.meta}>
                                        {workspace.owner.name} ·{' '}
                                        {whereItStands(workspace)} · view only
                                    </span>
                                </span>
                                <StageTrack run={run} />
                                {workspace.pullRequest ? (
                                    <MantineIcon
                                        icon={IconExternalLink}
                                        size={16}
                                        className={classes.chevron}
                                    />
                                ) : (
                                    <span />
                                )}
                            </UnstyledButton>
                        );
                    })}
                </Section>
            ) : null}
            {recent.length > 0 ? (
                <Section label="Live lately" count={recent.length}>
                    <ol className={classes.timeline}>
                        {recent.map((workspace) => (
                            <li key={workspace.workspaceUuid}>
                                <UnstyledButton
                                    className={classes.event}
                                    onClick={() => onOpen(workspace)}
                                >
                                    <span className={classes.eventDot}>
                                        <MantineIcon
                                            icon={IconCheck}
                                            size={10}
                                        />
                                    </span>
                                    <Text
                                        component="span"
                                        className={classes.eventName}
                                    >
                                        {workspace.name}
                                    </Text>
                                    <span className={classes.when}>
                                        {whereItStands(workspace)} ·{' '}
                                        {dayjs(
                                            workspace.finishedAt ??
                                                workspace.updatedAt,
                                        ).fromNow()}
                                    </span>
                                </UnstyledButton>
                            </li>
                        ))}
                    </ol>
                </Section>
            ) : null}
        </Box>
    );
};
