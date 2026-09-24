import { assertUnreachable } from '@lightdash/common';
import { open, stat } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { expect } from 'playwright/test';
import { z } from 'zod';
import { backendLogPath } from './env';
import { reportSkippedCheck, reportWarning } from './report';

// The attribution witness: `ai.usage` lines emitted by emitAiUsage
// (packages/backend/src/analytics/aiUsage.ts). Precondition: the backend logs
// with LIGHTDASH_LOG_FORMAT=json. The pretty and plain formats print only the
// message string, which lacks functionId, aiAgentId, threadId and promptId.

export type UsageKey =
    | 'feature'
    | 'functionId'
    | 'organizationId'
    | 'projectId'
    | 'aiAgentId'
    | 'threadId'
    | 'promptId'
    | 'dataAppId'
    | 'userId'
    | 'model'
    | 'provider'
    | 'keyManagement'
    | 'managedAgentRunId'
    | 'deepResearchRunId'
    | 'deepResearchPhase'
    | 'inputTokens'
    | 'outputTokens'
    | 'cacheReadTokens'
    | 'cacheWriteTokens'
    | 'reasoningTokens'
    | 'totalTokens';

export type UsageLine = {
    raw: string;
    values: Map<string, string | null>;
};

const usageEvent = z.looseObject({ event: z.literal('ai.usage') });
const TEXT_USAGE_MARKER = 'AI usage: feature=';

type ParsedLogLine =
    | { kind: 'usage'; line: UsageLine }
    | { kind: 'text-usage' }
    | { kind: 'other' };

const parseLogLine = (raw: string): ParsedLogLine => {
    const start = raw.indexOf('{');
    if (start !== -1) {
        let value: unknown;
        try {
            value = JSON.parse(raw.slice(start));
        } catch {
            value = null;
        }
        const event = usageEvent.safeParse(value);
        if (event.success) {
            const values = new Map<string, string | null>();
            Object.entries(event.data).forEach(([key, field]) => {
                if (typeof field === 'string') values.set(key, field);
                else if (typeof field === 'number') {
                    values.set(key, String(field));
                } else if (field === null) values.set(key, null);
            });
            return { kind: 'usage', line: { raw, values } };
        }
    }
    return raw.includes(TEXT_USAGE_MARKER)
        ? { kind: 'text-usage' }
        : { kind: 'other' };
};

export const usageValue = (line: UsageLine, key: UsageKey): string | null =>
    line.values.get(key) ?? null;

export const usageTokens = (line: UsageLine, key: UsageKey): number | null => {
    const value = usageValue(line, key);
    return value === null ? null : Number(value);
};

export type UsageExpectation =
    | { kind: 'present' }
    | { kind: 'equals'; value: string };

export const present: UsageExpectation = { kind: 'present' };

export const equals = (value: string): UsageExpectation => ({
    kind: 'equals',
    value,
});

/** Asserts attribution keys on a usage line: present and non-null, or equal. */
export const expectUsageLine = (
    line: UsageLine,
    expectations: Partial<Record<UsageKey, UsageExpectation>>,
) => {
    Object.entries(expectations).forEach(([key, expectation]) => {
        if (expectation === undefined) return;
        const value = line.values.get(key) ?? null;
        expect(value, `${key} on AI usage line: ${line.raw}`).not.toBeNull();
        switch (expectation.kind) {
            case 'present':
                return;
            case 'equals':
                expect(value, `${key} on AI usage line: ${line.raw}`).toBe(
                    expectation.value,
                );
                return;
            default:
                assertUnreachable(expectation, 'Unknown usage expectation');
        }
    });
};

export type UsageLogMark =
    | { kind: 'unset' }
    | { kind: 'marked'; path: string; offset: number };

/** Remembers where the backend log ends, so later reads see only new lines. */
export const markUsageLog = async (): Promise<UsageLogMark> =>
    backendLogPath === null
        ? { kind: 'unset' }
        : {
              kind: 'marked',
              path: backendLogPath,
              offset: (await stat(backendLogPath)).size,
          };

export const logSize = async (path: string) => (await stat(path)).size;

const readRawLinesSince = async (
    mark: Extract<UsageLogMark, { kind: 'marked' }>,
): Promise<string[]> => {
    const handle = await open(mark.path, 'r');
    try {
        const { size } = await handle.stat();
        // A log that shrank was truncated or rotated: read it whole.
        const start = size < mark.offset ? 0 : mark.offset;
        const buffer = Buffer.alloc(size - start);
        await handle.read(buffer, 0, buffer.length, start);
        return buffer.toString('utf8').split('\n');
    } finally {
        await handle.close();
    }
};

const readLogLinesSince = async (
    mark: Extract<UsageLogMark, { kind: 'marked' }>,
) => (await readRawLinesSince(mark)).map(parseLogLine);

const jsonLogRecord = z.looseObject({ message: z.string() });

/** Messages of the JSON log records written after `mark`. */
export const jsonLogMessagesSince = async (
    mark: Extract<UsageLogMark, { kind: 'marked' }>,
): Promise<string[]> =>
    (await readRawLinesSince(mark)).flatMap((raw) => {
        const start = raw.indexOf('{');
        if (start === -1) return [];
        try {
            const record = jsonLogRecord.safeParse(
                JSON.parse(raw.slice(start)),
            );
            return record.success ? [record.data.message] : [];
        } catch {
            return [];
        }
    });

/**
 * The backend's own account of a failure: log messages since `mark` starting
 * with one of `prefixes`. For failure messages only, never for assertions.
 */
export const explainFromLog = async (
    mark: UsageLogMark,
    prefixes: string[],
): Promise<string> => {
    switch (mark.kind) {
        case 'unset':
            return 'set E2E_AI_BACKEND_LOG to see the backend reason';
        case 'marked': {
            const messages = (await jsonLogMessagesSince(mark)).filter(
                (message) =>
                    prefixes.some((prefix) => message.startsWith(prefix)),
            );
            return messages.length > 0
                ? `Backend log: ${messages.join(' | ')}`
                : 'no matching backend log line';
        }
        default:
            return assertUnreachable(mark, 'Unknown usage log mark');
    }
};

const JSON_PRECONDITION =
    'E2E_AI_BACKEND_LOG needs the backend on LIGHTDASH_LOG_FORMAT=json; this log has plain-text AI usage lines';

/** Throws when the log since `mark` is not JSON, so the witness cannot work. */
const expectJsonLog = async (
    mark: Extract<UsageLogMark, { kind: 'marked' }>,
) => {
    const lines = await readLogLinesSince(mark);
    if (lines.some((line) => line.kind === 'text-usage')) {
        throw new Error(JSON_PRECONDITION);
    }
    return lines;
};

/** Usage lines logged after `mark`, without waiting for more. */
export const usageLinesSince = async (
    mark: Extract<UsageLogMark, { kind: 'marked' }>,
): Promise<UsageLine[]> =>
    (await expectJsonLog(mark)).flatMap((parsed) =>
        parsed.kind === 'usage' ? [parsed.line] : [],
    );

/**
 * Waits for usage lines matching `match` to reach the log after `mark`. The
 * wait covers log flushing only: the model call already returned.
 */
const waitForUsageLines = async (
    mark: Extract<UsageLogMark, { kind: 'marked' }>,
    match: (line: UsageLine) => boolean,
): Promise<UsageLine[]> => {
    let matched: UsageLine[] = [];
    await expect
        .poll(
            async () => {
                matched = (await usageLinesSince(mark)).filter(match);
                return matched.length;
            },
            { message: `matching AI usage line in ${mark.path}` },
        )
        .toBeGreaterThan(0);
    return matched;
};

// The usage line is written before the call returns; this only covers
// flushing to the file.
const FLUSH_WAIT_MS = 10_000;

/** Usage lines matching `match` after `mark`, or none once flushing is over. */
const findUsageLines = async (
    mark: Extract<UsageLogMark, { kind: 'marked' }>,
    match: (line: UsageLine) => boolean,
): Promise<UsageLine[]> => {
    const deadline = Date.now() + FLUSH_WAIT_MS;
    for (;;) {
        const matched = (await usageLinesSince(mark)).filter(match);
        if (matched.length > 0 || Date.now() >= deadline) return matched;
        await sleep(500);
    }
};

/**
 * For a call the product does not attribute yet: asserts the lines when they
 * appear, and otherwise reports `gap` loudly instead of failing, so the check
 * becomes an assertion as soon as the product starts logging them.
 */
export const witnessUsageOrReportGap = async (
    mark: UsageLogMark,
    check: string,
    match: (line: UsageLine) => boolean,
    assert: (lines: UsageLine[]) => void,
    gap: string,
) => {
    switch (mark.kind) {
        case 'unset':
            reportSkippedCheck(check, 'E2E_AI_BACKEND_LOG is unset');
            return;
        case 'marked': {
            const lines = await findUsageLines(mark, match);
            if (lines.length === 0) {
                reportWarning(`${check}: ${gap}`);
                return;
            }
            assert(lines);
            return;
        }
        default:
            assertUnreachable(mark, 'Unknown usage log mark');
    }
};

/**
 * Runs the attribution assertions against usage lines logged after `mark`,
 * or reports the check skipped when the witness is unset.
 */
export const witnessUsage = async (
    mark: UsageLogMark,
    check: string,
    match: (line: UsageLine) => boolean,
    assert: (lines: UsageLine[]) => void,
) => {
    switch (mark.kind) {
        case 'unset':
            reportSkippedCheck(check, 'E2E_AI_BACKEND_LOG is unset');
            return;
        case 'marked':
            assert(await waitForUsageLines(mark, match));
            return;
        default:
            assertUnreachable(mark, 'Unknown usage log mark');
    }
};
