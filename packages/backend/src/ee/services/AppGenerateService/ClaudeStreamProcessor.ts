/**
 * Stateful processor for the Claude CLI's `stream-json` stdout (with
 * `--include-partial-messages`). Pure of side effects — `feedChunk` returns
 * a list of high-level events that the caller wires to logging, status
 * updates, and result capture.
 *
 * Owning the parsing and state here keeps `AppGenerateService.runClaudeGeneration`
 * focused on orchestration: spawn the sandbox command, forward stdout chunks,
 * react to events.
 */

/**
 * Usage summary for a single `claude` run, extracted from the stream-json
 * `result` event. Token counts, turn count, API time, and cost — the pieces
 * needed to decompose `generateMs` into "too much output" vs "too many turns"
 * and to confirm prompt caching is landing (`cacheReadInputTokens > 0`).
 */
export type ClaudeGenerationUsage = {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
    numTurns: number;
    durationApiMs: number;
    costUsd: number;
};

export const ZERO_CLAUDE_USAGE: ClaudeGenerationUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    numTurns: 0,
    durationApiMs: 0,
    costUsd: 0,
};

/**
 * Sum two usage records field-by-field. One build can invoke `claude` several
 * times (main generation, build-fix re-runs, metadata), so the pipeline totals
 * them. Treats `null` as all-zero.
 */
export function addClaudeUsage(
    a: ClaudeGenerationUsage,
    b: ClaudeGenerationUsage | null,
): ClaudeGenerationUsage {
    if (!b) return a;
    return {
        inputTokens: a.inputTokens + b.inputTokens,
        outputTokens: a.outputTokens + b.outputTokens,
        cacheReadInputTokens: a.cacheReadInputTokens + b.cacheReadInputTokens,
        cacheCreationInputTokens:
            a.cacheCreationInputTokens + b.cacheCreationInputTokens,
        numTurns: a.numTurns + b.numTurns,
        durationApiMs: a.durationApiMs + b.durationApiMs,
        costUsd: a.costUsd + b.costUsd,
    };
}

export type ClaudeStreamEvent =
    | { kind: 'thinking_started'; turn: number }
    | { kind: 'thinking_snippet'; snippet: string }
    | { kind: 'tool_use'; index: number; description: string }
    | { kind: 'result'; text: string };

const STATUS_THROTTLE_MS = 3000;
const SNIPPET_SENTENCES = 1;

// --- Pure parsing helpers (module-private, used only by the processor) ---

/**
 * Return the most recent `n` complete sentences from `buf` as a single
 * paragraph: whitespace collapsed to single spaces, trailing periods
 * stripped (so they don't visually merge with the UI's animated "..."
 * indicator — `!` and `?` stay since they read distinctly), text-in-progress
 * after the last terminator dropped. Returns `''` while no complete sentence
 * exists yet — the caller skips empty updates so the status holds at
 * "Thinking".
 *
 * A sentence terminator is `[.!?]` followed by either whitespace + a capital
 * letter (which skips abbreviations like "e.g." that are followed by a
 * lowercase word) or end-of-string.
 *
 * Invariant for the frontend: the snippet collapses whitespace to a single
 * space, so it is always a single paragraph. The chat UI's `<p>` override
 * that injects `<LoadingDots />` inside the rendered paragraph relies on
 * this — if you change the snippet to preserve `\n\n`, the override needs
 * to learn about "last paragraph only".
 */
function lastSentencesSnippet(buf: string, n: number): string {
    const flat = buf.replace(/\s+/g, ' ').trim();
    const re = /[.!?](?=\s+[A-Z])|[.!?]$/g;
    const positions: number[] = [];
    let m = re.exec(flat);
    while (m !== null) {
        positions.push(m.index);
        m = re.exec(flat);
    }
    if (positions.length === 0) return '';
    const end = positions[positions.length - 1];
    const sliceStart =
        positions.length > n ? positions[positions.length - n - 1] + 1 : 0;
    return flat
        .slice(sliceStart, end + 1)
        .trim()
        .replace(/\.+$/, '');
}

/**
 * Parse an `assistant` event (the fully assembled message at turn end) and
 * return a comma-joined description of its `tool_use` content blocks. For
 * `Read`/`Write`/`Edit` the description also includes the file path.
 * Returns `undefined` for non-assistant events or assistant events without
 * any tool calls.
 */
function parseToolUseDescription(line: string): string | undefined {
    let event: Record<string, unknown>;
    try {
        event = JSON.parse(line);
    } catch {
        return undefined;
    }
    if (event.type !== 'assistant') return undefined;

    const msg = event.message as Record<string, unknown> | undefined;
    const content = (msg?.content ?? []) as Array<Record<string, unknown>>;
    const tools: string[] = [];
    for (const block of content) {
        if (block.type === 'tool_use') {
            const name = String(block.name ?? '');
            const input = (block.input ?? {}) as Record<string, unknown>;
            if (name === 'Write' || name === 'Read' || name === 'Edit') {
                tools.push(`${name} ${String(input.file_path ?? '')}`);
            } else {
                tools.push(name);
            }
        }
    }
    return tools.length > 0 ? tools.join(', ') : undefined;
}

/**
 * Detect turn boundaries and the first thinking/text block of a turn from
 * a `stream_event` line emitted under `--include-partial-messages`.
 * Returns `'message_start'` at the start of each assistant turn, and
 * `'thinking_or_text_start'` when Claude begins reasoning or narrating
 * (i.e. before any `tool_use` arrives in the turn).
 */
function parsePartialStreamEventKind(
    line: string,
): 'message_start' | 'thinking_or_text_start' | undefined {
    let event: Record<string, unknown>;
    try {
        event = JSON.parse(line);
    } catch {
        return undefined;
    }
    if (event.type !== 'stream_event') return undefined;
    const inner = event.event as Record<string, unknown> | undefined;
    if (!inner) return undefined;
    if (inner.type === 'message_start') return 'message_start';
    if (inner.type === 'content_block_start') {
        const block = inner.content_block as
            | Record<string, unknown>
            | undefined;
        if (block?.type === 'thinking' || block?.type === 'text') {
            return 'thinking_or_text_start';
        }
    }
    return undefined;
}

/**
 * Parse a `content_block_delta` line and return the streamed text fragment
 * for `thinking_delta` or `text_delta` events. Used to surface Claude's
 * in-progress reasoning as a live status message. Other delta types
 * (`signature_delta`, `input_json_delta`) are ignored.
 */
function parsePartialDeltaText(
    line: string,
): { kind: 'thinking' | 'text'; delta: string } | undefined {
    let event: Record<string, unknown>;
    try {
        event = JSON.parse(line);
    } catch {
        return undefined;
    }
    if (event.type !== 'stream_event') return undefined;
    const inner = event.event as Record<string, unknown> | undefined;
    if (inner?.type !== 'content_block_delta') return undefined;
    const delta = inner.delta as Record<string, unknown> | undefined;
    if (!delta) return undefined;
    if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
        return { kind: 'thinking', delta: delta.thinking };
    }
    if (delta.type === 'text_delta' && typeof delta.text === 'string') {
        return { kind: 'text', delta: delta.text };
    }
    return undefined;
}

function asFiniteNumber(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Parse a stream-json `result` event: the final response text plus the run's
 * usage summary (token counts, turn count, API time, cost). Returns
 * `undefined` for non-result lines. Missing numeric fields default to 0 —
 * the `result` event is emitted once per run and always carries usage, but
 * we parse defensively in case a field is absent on older CLI versions.
 */
function parseResult(
    line: string,
): { text: string | null; usage: ClaudeGenerationUsage } | undefined {
    let event: Record<string, unknown>;
    try {
        event = JSON.parse(line);
    } catch {
        return undefined;
    }
    if (event.type !== 'result') return undefined;
    const usage = (event.usage ?? {}) as Record<string, unknown>;
    return {
        text: typeof event.result === 'string' ? event.result : null,
        usage: {
            inputTokens: asFiniteNumber(usage.input_tokens),
            outputTokens: asFiniteNumber(usage.output_tokens),
            cacheReadInputTokens: asFiniteNumber(usage.cache_read_input_tokens),
            cacheCreationInputTokens: asFiniteNumber(
                usage.cache_creation_input_tokens,
            ),
            numTurns: asFiniteNumber(event.num_turns),
            durationApiMs: asFiniteNumber(event.duration_api_ms),
            costUsd: asFiniteNumber(event.total_cost_usd),
        },
    };
}

export class ClaudeStreamProcessor {
    private lineBuffer = '';

    private toolCallCount = 0;

    private turnCount = 0;

    private thinkingStartedThisTurn = false;

    private thinkingTextBuffer = '';

    private lastSnippetEmittedAt = 0;

    private lastEmittedSnippet = '';

    private lastUsageValue: ClaudeGenerationUsage | null = null;

    private readonly now: () => number;

    /**
     * `now` is injectable purely for future testability — defaults to
     * `Date.now`. Not used in production code paths.
     */
    constructor(now: () => number = () => Date.now()) {
        this.now = now;
    }

    /**
     * Total tool calls observed across all turns so far. Used for the
     * post-run summary log.
     */
    get totalToolCalls(): number {
        return this.toolCallCount;
    }

    /**
     * Usage summary from the run's `result` event, or `null` if no result
     * event was seen (e.g. the CLI died before finishing). Read after the
     * run completes — same pattern as `totalToolCalls`.
     */
    get lastUsage(): ClaudeGenerationUsage | null {
        return this.lastUsageValue;
    }

    /**
     * Feed a chunk of stdout. Lines are buffered across chunks; events fire
     * only for fully consumed lines.
     */
    feedChunk(chunk: string): ClaudeStreamEvent[] {
        this.lineBuffer += chunk;
        const lines = this.lineBuffer.split('\n');
        this.lineBuffer = lines.pop() ?? '';
        const events: ClaudeStreamEvent[] = [];
        for (const line of lines) {
            if (line.trim()) {
                this.consumeLine(line, events);
            }
        }
        return events;
    }

    private consumeLine(line: string, events: ClaudeStreamEvent[]): void {
        const partialKind = parsePartialStreamEventKind(line);
        if (partialKind === 'message_start') {
            this.turnCount += 1;
            this.thinkingStartedThisTurn = false;
            this.thinkingTextBuffer = '';
            this.lastSnippetEmittedAt = 0;
            this.lastEmittedSnippet = '';
            return;
        }
        if (
            partialKind === 'thinking_or_text_start' &&
            !this.thinkingStartedThisTurn
        ) {
            this.thinkingStartedThisTurn = true;
            events.push({ kind: 'thinking_started', turn: this.turnCount });
            return;
        }

        const delta = parsePartialDeltaText(line);
        if (delta) {
            this.thinkingTextBuffer += delta.delta;
            const t = this.now();
            if (t - this.lastSnippetEmittedAt >= STATUS_THROTTLE_MS) {
                const snippet = lastSentencesSnippet(
                    this.thinkingTextBuffer,
                    SNIPPET_SENTENCES,
                );
                if (snippet && snippet !== this.lastEmittedSnippet) {
                    this.lastSnippetEmittedAt = t;
                    this.lastEmittedSnippet = snippet;
                    events.push({ kind: 'thinking_snippet', snippet });
                }
            }
            return;
        }

        const description = parseToolUseDescription(line);
        if (description) {
            this.toolCallCount += 1;
            events.push({
                kind: 'tool_use',
                index: this.toolCallCount,
                description,
            });
            return;
        }

        const result = parseResult(line);
        if (result) {
            this.lastUsageValue = result.usage;
            events.push({ kind: 'result', text: result.text ?? '' });
        }
    }
}
