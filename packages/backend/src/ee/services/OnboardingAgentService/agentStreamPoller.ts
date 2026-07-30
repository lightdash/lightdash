import { getErrorMessage } from '@lightdash/common';
import {
    SandboxConnectionError,
    SandboxNotRunningError,
    SandboxTimeoutError,
    type SandboxHandle,
    type SandboxLogger,
} from '../SandboxRuntime';
import {
    AGENT_EXIT_CODE_PATH,
    AGENT_STREAM_PATH,
    RUN_TIMEOUT_MS,
    SANDBOX_DISCONNECT_GRACE_MS,
    STREAM_POLL_INTERVAL_MS,
} from './constants';

const EXIT_SEPARATOR = '__LIGHTDASH_AGENT_EXIT_SECTION__';
const PROCESS_SEPARATOR = '__LIGHTDASH_AGENT_PROCESS_SECTION__';
const DEFAULT_DEADLINE_MS = RUN_TIMEOUT_MS + 60 * 1000;

type PollerLogger = Pick<SandboxLogger, 'warn'>;

type PollerTimeouts = {
    pollIntervalMs?: number;
    disconnectGraceMs?: number;
    deadlineMs?: number;
};

type PollTick = {
    exitCode: number | null;
    processCount: number;
    tail: string;
};

const parseInteger = (value: string, field: string): number => {
    const trimmed = value.trim();
    if (!/^-?\d+$/.test(trimmed)) {
        throw new SandboxConnectionError(
            `Received an invalid ${field} from the onboarding agent workspace`,
        );
    }
    return Number.parseInt(trimmed, 10);
};

const parsePollTick = (stdout: string): PollTick => {
    const exitSeparator = `\n${EXIT_SEPARATOR}\n`;
    const processSeparator = `\n${PROCESS_SEPARATOR}\n`;
    const exitSections = stdout.split(exitSeparator);
    if (exitSections.length !== 2) {
        throw new SandboxConnectionError(
            'Received an invalid response from the onboarding agent workspace',
        );
    }
    const processSections = exitSections[1].split(processSeparator);
    if (processSections.length !== 2) {
        throw new SandboxConnectionError(
            'Received an invalid response from the onboarding agent workspace',
        );
    }

    const exitCodeText = exitSections[0].trim();
    return {
        exitCode:
            exitCodeText.length > 0
                ? parseInteger(exitCodeText, 'exit code')
                : null,
        processCount: parseInteger(processSections[0], 'process count'),
        tail: processSections[1],
    };
};

const sleep = (durationMs: number): Promise<void> =>
    new Promise((resolve) => {
        setTimeout(resolve, durationMs);
    });

export async function pollDetachedAgentRun(args: {
    sandbox: SandboxHandle;
    onLine: (line: string) => void;
    logger: PollerLogger;
    timeouts?: PollerTimeouts;
}): Promise<{ exitCode: number }> {
    const { sandbox, onLine, logger } = args;
    const pollIntervalMs =
        args.timeouts?.pollIntervalMs ?? STREAM_POLL_INTERVAL_MS;
    const disconnectGraceMs =
        args.timeouts?.disconnectGraceMs ?? SANDBOX_DISCONNECT_GRACE_MS;
    const deadlineMs = args.timeouts?.deadlineMs ?? DEFAULT_DEADLINE_MS;
    const startedAt = Date.now();
    let lastSuccessfulTickAt = startedAt;
    let consumedLines = 0;
    let consecutiveDeadTicks = 0;

    const consumeTail = (tail: string, final: boolean): void => {
        if (tail.length === 0) return;
        const lines = tail.split('\n');
        if (tail.endsWith('\n')) {
            lines.pop();
        } else if (!final) {
            lines.pop();
        }
        consumedLines += lines.length;
        for (const line of lines) {
            if (line.length > 0) onLine(line);
        }
    };

    const poll = async (): Promise<{ exitCode: number }> => {
        if (Date.now() - startedAt >= deadlineMs) {
            throw new SandboxTimeoutError(
                'The onboarding agent exceeded its polling deadline',
            );
        }

        // The bracket pattern prevents pgrep from matching this poll command.
        const command =
            `cat ${AGENT_EXIT_CODE_PATH} 2>/dev/null; ` +
            `printf '\\n${EXIT_SEPARATOR}\\n'; ` +
            'if command -v pgrep >/dev/null 2>&1; then ' +
            "pgrep -cf 'ld-agent-runner[.]sh' || true; " +
            "else printf -- '-1\\n'; fi; " +
            `printf '\\n${PROCESS_SEPARATOR}\\n'; ` +
            `tail -n +${consumedLines + 1} ${AGENT_STREAM_PATH} 2>/dev/null || true`;

        let stdout: string;
        try {
            const result = await sandbox.commands.run(command);
            stdout = result.stdout;
        } catch (error) {
            if (error instanceof SandboxNotRunningError) throw error;
            consecutiveDeadTicks = 0;
            const disconnectedForMs = Date.now() - lastSuccessfulTickAt;
            if (disconnectedForMs > disconnectGraceMs) {
                throw new SandboxConnectionError(
                    `Could not reconnect to the onboarding agent workspace after ${disconnectedForMs}ms`,
                );
            }
            logger.warn(
                `OnboardingAgent: sandbox poll failed, retrying: ${getErrorMessage(
                    error,
                )}`,
            );
            await sleep(pollIntervalMs);
            return poll();
        }

        const tick = parsePollTick(stdout);
        lastSuccessfulTickAt = Date.now();
        if (tick.exitCode !== null) {
            consumeTail(tick.tail, true);
            return { exitCode: tick.exitCode };
        }

        consumeTail(tick.tail, false);
        if (tick.processCount === 0) {
            consecutiveDeadTicks += 1;
            if (consecutiveDeadTicks >= 2) {
                throw new SandboxConnectionError(
                    'The onboarding agent process stopped unexpectedly',
                );
            }
        } else if (tick.processCount > 0) {
            consecutiveDeadTicks = 0;
        }

        await sleep(pollIntervalMs);
        return poll();
    };

    return poll();
}
