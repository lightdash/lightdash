/**
 * Minimal analyzer for the Claude CLI's stream-json output (with
 * --include-partial-messages). Standalone reimplementation of the backend's
 * ClaudeStreamProcessor timing model so the benchmark needs no backend
 * imports: inter-delta gaps are attributed to the kind of the delta that
 * ends them; the message_start → first-delta gap is API latency; the
 * last-delta → next message_start (or final result) gap is tool execution.
 */

export type ToolCall = {
    turn: number;
    name: string;
    input: Record<string, unknown>;
};

export type StreamAnalysis = {
    turns: number;
    turnDurationsMs: number[];
    ttftMs: number | null;
    timings: {
        apiLatencyMs: number;
        thinkingMs: number;
        textMs: number;
        toolInputMs: number;
        toolExecMs: number;
    };
    toolCalls: ToolCall[];
    /** tool_result blocks with is_error: true (content preview). */
    toolErrors: string[];
    /** Subset of toolErrors that look like permission denials. */
    deniedTools: string[];
    resultText: string | null;
    usage: {
        inputTokens: number;
        outputTokens: number;
        cacheReadInputTokens: number;
        numTurns: number;
        durationApiMs: number;
        costUsd: number;
    } | null;
};

type Timestamped = { atMs: number; line: string };

const num = (v: unknown): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : 0;

/**
 * Analyze a captured stream. `events` must be the raw stream-json lines with
 * the wall-clock ms at which each line was received (the runner records
 * arrival times while streaming).
 */
export function analyzeStream(events: Timestamped[]): StreamAnalysis {
    const analysis: StreamAnalysis = {
        turns: 0,
        turnDurationsMs: [],
        ttftMs: null,
        timings: {
            apiLatencyMs: 0,
            thinkingMs: 0,
            textMs: 0,
            toolInputMs: 0,
            toolExecMs: 0,
        },
        toolCalls: [],
        toolErrors: [],
        deniedTools: [],
        resultText: null,
        usage: null,
    };

    const startAt = events.length > 0 ? events[0].atMs : 0;
    let lastTurnStartAt: number | null = null;
    let lastDeltaAt: number | null = null;
    let awaitingFirstDelta = false;

    for (const { atMs, line } of events) {
        let event: Record<string, unknown>;
        try {
            event = JSON.parse(line);
        } catch {
            continue;
        }

        if (event.type === 'stream_event') {
            const inner = event.event as Record<string, unknown> | undefined;
            if (!inner) continue;
            if (inner.type === 'message_start') {
                if (analysis.ttftMs === null) analysis.ttftMs = atMs - startAt;
                if (lastTurnStartAt !== null) {
                    analysis.turnDurationsMs.push(atMs - lastTurnStartAt);
                }
                if (lastDeltaAt !== null && !awaitingFirstDelta) {
                    analysis.timings.toolExecMs += atMs - lastDeltaAt;
                }
                lastTurnStartAt = atMs;
                lastDeltaAt = atMs;
                awaitingFirstDelta = true;
                analysis.turns += 1;
                continue;
            }
            if (inner.type === 'content_block_delta') {
                const delta = inner.delta as
                    | Record<string, unknown>
                    | undefined;
                if (!delta) continue;
                const kind =
                    delta.type === 'thinking_delta'
                        ? 'thinking'
                        : delta.type === 'text_delta'
                          ? 'text'
                          : delta.type === 'input_json_delta'
                            ? 'tool_input'
                            : null;
                if (!kind) continue;
                if (lastDeltaAt !== null) {
                    const gap = atMs - lastDeltaAt;
                    if (awaitingFirstDelta) {
                        analysis.timings.apiLatencyMs += gap;
                    } else if (kind === 'thinking') {
                        analysis.timings.thinkingMs += gap;
                    } else if (kind === 'text') {
                        analysis.timings.textMs += gap;
                    } else {
                        analysis.timings.toolInputMs += gap;
                    }
                }
                awaitingFirstDelta = false;
                lastDeltaAt = atMs;
            }
            continue;
        }

        if (event.type === 'assistant') {
            const msg = event.message as Record<string, unknown> | undefined;
            const content = (msg?.content ?? []) as Array<
                Record<string, unknown>
            >;
            for (const block of content) {
                if (block.type === 'tool_use') {
                    analysis.toolCalls.push({
                        turn: analysis.turns,
                        name: String(block.name ?? '?'),
                        input: (block.input ?? {}) as Record<string, unknown>,
                    });
                }
            }
            continue;
        }

        if (event.type === 'user') {
            const msg = event.message as Record<string, unknown> | undefined;
            const content = (msg?.content ?? []) as Array<
                Record<string, unknown>
            >;
            for (const block of content) {
                if (block.type !== 'tool_result' || block.is_error !== true) {
                    continue;
                }
                const text =
                    typeof block.content === 'string'
                        ? block.content
                        : JSON.stringify(block.content ?? '');
                const preview = text.slice(0, 200);
                analysis.toolErrors.push(preview);
                if (/permission|denied|not allowed|haven't granted/i.test(text)) {
                    analysis.deniedTools.push(preview);
                }
            }
            continue;
        }

        if (event.type === 'result') {
            if (lastDeltaAt !== null && !awaitingFirstDelta) {
                analysis.timings.toolExecMs += atMs - lastDeltaAt;
                lastDeltaAt = null;
            }
            if (lastTurnStartAt !== null) {
                analysis.turnDurationsMs.push(atMs - lastTurnStartAt);
                lastTurnStartAt = null;
            }
            analysis.resultText =
                typeof event.result === 'string' ? event.result : null;
            const usage = (event.usage ?? {}) as Record<string, unknown>;
            analysis.usage = {
                inputTokens: num(usage.input_tokens),
                outputTokens: num(usage.output_tokens),
                cacheReadInputTokens: num(usage.cache_read_input_tokens),
                numTurns: num(event.num_turns),
                durationApiMs: num(event.duration_api_ms),
                costUsd: num(event.total_cost_usd),
            };
        }
    }

    return analysis;
}
