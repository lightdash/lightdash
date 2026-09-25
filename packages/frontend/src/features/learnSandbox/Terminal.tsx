import {
    type LearnCommandOutputChunk,
    type LearnCommandStatus,
} from '@lightdash/common';
import { Box, Button, Group, ScrollArea, Stack } from '@mantine/core';
import { IconPlayerPlay } from '@tabler/icons-react';
import {
    useEffect,
    useRef,
    type FC,
    type KeyboardEvent,
    type UIEvent,
} from 'react';
import MantineIcon from '../../components/common/MantineIcon';
// eslint-disable-next-line css-modules/no-unused-class -- classes shared across learnSandbox files
import styles from './LearnWorkspace.module.css';

const BOTTOM_THRESHOLD_PX = 32;

/** Commands the learner can drop into the input without typing them out. */
const QUICK_COMMANDS = [
    'dbt parse',
    'lightdash compile',
    'lightdash deploy',
    'lightdash validate',
];

export type TerminalOutput = {
    status: LearnCommandStatus | null;
    exitCode: number | null;
    startedAt: string | null;
    finishedAt: string | null;
    chunks: LearnCommandOutputChunk[];
    error: string | null;
    isActive: boolean;
};

const EMPTY_STATE_LABEL = 'Run a command to see its output here';

const getStatusLabel = (
    status: LearnCommandStatus | null,
    exitCode: number | null,
): string => {
    switch (status) {
        case null:
            return '';
        case 'queued':
            return 'Queued';
        case 'running':
            return 'Running';
        case 'done':
            return 'Finished';
        case 'error':
            return exitCode === null ? 'Failed' : `Failed (exit ${exitCode})`;
        case 'timeout':
            return 'Timed out';
        default:
            return '';
    }
};

/** Whole seconds between two ISO timestamps, or null unless both are set. */
const getElapsedSeconds = (
    startedAt: string | null,
    finishedAt: string | null,
): number | null => {
    if (!startedAt || !finishedAt) return null;
    const started = new Date(startedAt).getTime();
    const finished = new Date(finishedAt).getTime();
    if (Number.isNaN(started) || Number.isNaN(finished)) return null;
    return Math.max(0, Math.round((finished - started) / 1000));
};

type TerminalProps = {
    value: string;
    onValueChange: (value: string) => void;
    onRun: () => void;
    running: boolean;
    disabled: boolean;
    output: TerminalOutput;
};

/**
 * The sandbox terminal: a command input with quick-pick chips over a
 * streamed output pane. Follow-scroll logic copied from
 * `ee/features/agentOnboarding/AgentOnboardingActivity.tsx` (do not import
 * from `ee/` here) — the viewport auto-scrolls to the newest chunk unless
 * the learner has scrolled up to read earlier output.
 */
const Terminal: FC<TerminalProps> = ({
    value,
    onValueChange,
    onRun,
    running,
    disabled,
    output,
}) => {
    const viewportRef = useRef<HTMLDivElement>(null);
    const shouldFollowRef = useRef(true);

    useEffect(() => {
        if (!shouldFollowRef.current) return;
        const frame = window.requestAnimationFrame(() => {
            if (!viewportRef.current) return;
            viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
        });
        return () => window.cancelAnimationFrame(frame);
    }, [output.chunks]);

    const handleScroll = (event: UIEvent<HTMLDivElement>) => {
        const element = event.currentTarget;
        shouldFollowRef.current =
            element.scrollHeight - element.scrollTop - element.clientHeight <=
            BOTTOM_THRESHOLD_PX;
    };

    const isValueEmpty = value.trim().length === 0;
    const runDisabled = disabled || running || isValueEmpty;

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        if (runDisabled) return;
        onRun();
    };

    const handleRun = () => {
        if (runDisabled) return;
        onRun();
    };

    const elapsedSeconds = getElapsedSeconds(
        output.startedAt,
        output.finishedAt,
    );
    const statusLabel = getStatusLabel(output.status, output.exitCode);
    const statusText =
        statusLabel && elapsedSeconds !== null
            ? `${statusLabel} · ${elapsedSeconds}s`
            : statusLabel;
    const isEmpty =
        output.chunks.length === 0 && output.status === null && !output.error;

    return (
        <Box className={styles.terminalPane}>
            <Group className={styles.terminalBar} gap="xs" wrap="nowrap">
                <input
                    className={styles.terminalInput}
                    aria-label="Command"
                    value={value}
                    onChange={(event) =>
                        onValueChange(event.currentTarget.value)
                    }
                    onKeyDown={handleKeyDown}
                    placeholder="dbt parse"
                    data-tour-anchor="terminal-command"
                    data-tour-hint="Type the command"
                    data-tour-input="true"
                    data-tour-suggest="dbt parse"
                />
                <Button
                    data-tour-anchor="terminal-run"
                    data-tour-hint="Run the command"
                    disabled={runDisabled}
                    onClick={handleRun}
                    leftSection={<MantineIcon icon={IconPlayerPlay} />}
                >
                    Run
                </Button>
            </Group>
            <Group className={styles.terminalChips} gap="xs" wrap="wrap">
                {QUICK_COMMANDS.map((command) => (
                    <Button
                        key={command}
                        variant="default"
                        size="compact-xs"
                        disabled={disabled || running}
                        onClick={() => onValueChange(command)}
                    >
                        {command}
                    </Button>
                ))}
            </Group>
            <Box
                className={styles.terminalOutput}
                data-learn-terminal-output
                data-tour-busy={running ? 'true' : undefined}
                data-tour-anchor={running ? 'terminal-running' : undefined}
                data-tour-hint={
                    running ? 'Wait for the command to finish' : undefined
                }
            >
                <ScrollArea
                    viewportRef={viewportRef}
                    className={styles.terminalViewport}
                    viewportProps={{ onScroll: handleScroll }}
                >
                    <Stack gap={4} p="md">
                        {isEmpty ? (
                            <span className={styles.terminalLine}>
                                {EMPTY_STATE_LABEL}
                            </span>
                        ) : null}
                        {output.chunks.map((chunk) => (
                            <span
                                key={chunk.seq}
                                className={styles.terminalLine}
                                data-stream={chunk.stream}
                            >
                                {chunk.text}
                            </span>
                        ))}
                        {output.error ? (
                            <span className={styles.terminalErrorLine}>
                                {output.error}
                            </span>
                        ) : null}
                    </Stack>
                </ScrollArea>
                <Box className={styles.terminalFooter}>
                    <span data-tour-status="true">{statusText}</span>
                </Box>
            </Box>
        </Box>
    );
};

export default Terminal;
