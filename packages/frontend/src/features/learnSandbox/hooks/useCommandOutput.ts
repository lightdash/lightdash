import {
    type ApiError,
    type LearnCommandOutputChunk,
    type LearnCommandStatus,
} from '@lightdash/common';
import { useEffect, useState } from 'react';
import { getCommandOutput } from '../api';
import { sanitizeTerminalText } from '../terminalText';

const POLL_INTERVAL_MS = 500;

type CommandOutputState = {
    status: LearnCommandStatus | null;
    exitCode: number | null;
    startedAt: string | null;
    finishedAt: string | null;
    chunks: LearnCommandOutputChunk[];
    error: string | null;
};

const EMPTY_STATE: CommandOutputState = {
    status: null,
    exitCode: null,
    startedAt: null,
    finishedAt: null,
    chunks: [],
    error: null,
};

const isTerminalStatus = (status: LearnCommandStatus) =>
    status === 'done' || status === 'error' || status === 'timeout';

/**
 * Polls the command output endpoint every 500ms with an `after` cursor
 * that advances to the last received chunk's `seq`, accumulating chunks
 * until the command reaches a terminal status (done/error/timeout) or the
 * poll itself fails. Not react-query: this is a stream of appended output
 * for a single in-flight command, not a cacheable resource.
 */
export const useCommandOutput = (
    projectUuid: string,
    commandUuid: string | null,
) => {
    const [state, setState] = useState<CommandOutputState>(EMPTY_STATE);

    useEffect(() => {
        setState(EMPTY_STATE);
        if (!commandUuid) return undefined;

        let after = 0;
        let stopped = false;
        let inFlight = false;
        let timer: ReturnType<typeof setInterval>;

        const tick = async () => {
            if (stopped || inFlight) return;
            inFlight = true;
            try {
                const out = await getCommandOutput(
                    projectUuid,
                    commandUuid,
                    after,
                );
                if (stopped) return;
                if (out.chunks.length > 0) {
                    after = out.chunks[out.chunks.length - 1].seq;
                }
                const sanitizedChunks = out.chunks.map((chunk) => ({
                    ...chunk,
                    text: sanitizeTerminalText(chunk.text),
                }));
                setState((prev) => ({
                    ...prev,
                    status: out.status,
                    exitCode: out.exitCode,
                    startedAt: out.startedAt,
                    finishedAt: out.finishedAt,
                    chunks: [...prev.chunks, ...sanitizedChunks],
                    error: null,
                }));
                if (isTerminalStatus(out.status)) {
                    stopped = true;
                    clearInterval(timer);
                }
            } catch (e) {
                if (stopped) return;
                setState((prev) => ({
                    ...prev,
                    error:
                        (e as ApiError).error?.message ??
                        'Could not read the command output',
                }));
                stopped = true;
                clearInterval(timer);
            } finally {
                inFlight = false;
            }
        };

        timer = setInterval(() => void tick(), POLL_INTERVAL_MS);
        void tick();

        return () => {
            stopped = true;
            clearInterval(timer);
        };
    }, [projectUuid, commandUuid]);

    return {
        ...state,
        isActive: state.status === 'queued' || state.status === 'running',
    };
};
