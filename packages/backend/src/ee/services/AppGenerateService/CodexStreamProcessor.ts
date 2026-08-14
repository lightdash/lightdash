import {
    addClaudeUsage,
    ZERO_CLAUDE_USAGE,
    type ClaudeGenerationUsage,
    type ClaudeStreamEvent,
} from './ClaudeStreamProcessor';

const asFiniteNumber = (value: unknown): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : 0;

const compact = (value: string, maxLength = 180): string => {
    const flat = value.replace(/\s+/g, ' ').trim();
    return flat.length > maxLength ? `${flat.slice(0, maxLength - 1)}…` : flat;
};

/** Parses the stable JSONL event stream emitted by `codex exec --json`. */
export class CodexStreamProcessor {
    private lineBuffer = '';

    private toolCallCount = 0;

    private turnCount = 0;

    private readonly seenToolItems = new Set<string>();

    private lastUsageValue: ClaudeGenerationUsage | null = null;

    private firstItemAt: number | null = null;

    private turnStartedAt: number | null = null;

    private readonly turnDurations: number[] = [];

    private readonly now: () => number;

    private readonly createdAt: number;

    constructor(now: () => number = () => Date.now()) {
        this.now = now;
        this.createdAt = now();
    }

    get totalToolCalls(): number {
        return this.toolCallCount;
    }

    get lastUsage(): ClaudeGenerationUsage | null {
        return this.lastUsageValue;
    }

    get timeToFirstTokenMs(): number | null {
        return this.firstItemAt === null
            ? null
            : this.firstItemAt - this.createdAt;
    }

    get turnDurationsMs(): number[] {
        return [...this.turnDurations];
    }

    feedChunk(chunk: string): ClaudeStreamEvent[] {
        this.lineBuffer += chunk;
        const lines = this.lineBuffer.split('\n');
        this.lineBuffer = lines.pop() ?? '';
        const events: ClaudeStreamEvent[] = [];
        for (const line of lines) {
            if (line.trim()) this.consumeLine(line, events);
        }
        return events;
    }

    private consumeLine(line: string, events: ClaudeStreamEvent[]): void {
        let event: Record<string, unknown>;
        try {
            event = JSON.parse(line) as Record<string, unknown>;
        } catch {
            return;
        }

        if (event.type === 'turn.started') {
            this.turnCount += 1;
            this.turnStartedAt = this.now();
            events.push({ kind: 'thinking_started', turn: this.turnCount });
            return;
        }

        if (event.type === 'item.started' || event.type === 'item.completed') {
            if (this.firstItemAt === null) this.firstItemAt = this.now();
            const item = event.item as Record<string, unknown> | undefined;
            if (!item) return;
            const itemType = String(item.type ?? '');

            if (
                event.type === 'item.completed' &&
                itemType === 'reasoning' &&
                typeof item.text === 'string'
            ) {
                const snippet = compact(item.text);
                if (snippet) events.push({ kind: 'thinking_snippet', snippet });
                return;
            }

            if (
                itemType === 'command_execution' ||
                itemType === 'file_change'
            ) {
                const itemId = String(item.id ?? `${itemType}:${line}`);
                if (this.seenToolItems.has(itemId)) return;
                this.seenToolItems.add(itemId);
                this.toolCallCount += 1;
                const description =
                    itemType === 'command_execution'
                        ? `Command ${compact(String(item.command ?? ''))}`
                        : `Edit ${String(item.path ?? item.file_path ?? 'files')}`;
                events.push({
                    kind: 'tool_use',
                    index: this.toolCallCount,
                    description,
                });
                return;
            }

            if (
                event.type === 'item.completed' &&
                itemType === 'agent_message'
            ) {
                events.push({
                    kind: 'result',
                    text: typeof item.text === 'string' ? item.text : '',
                    structuredOutput: null,
                });
            }
            return;
        }

        if (event.type === 'turn.completed') {
            if (this.turnStartedAt !== null) {
                this.turnDurations.push(this.now() - this.turnStartedAt);
                this.turnStartedAt = null;
            }
            const usage = (event.usage ?? {}) as Record<string, unknown>;
            const inputTokens = asFiniteNumber(usage.input_tokens);
            const cachedInputTokens = asFiniteNumber(usage.cached_input_tokens);
            const turnUsage: ClaudeGenerationUsage = {
                // Codex reports cached input as a subset of input_tokens;
                // the shared usage path stores uncached + cache separately.
                inputTokens: Math.max(0, inputTokens - cachedInputTokens),
                outputTokens: asFiniteNumber(usage.output_tokens),
                cacheReadInputTokens: cachedInputTokens,
                cacheCreationInputTokens: 0,
                numTurns: 1,
                durationApiMs: 0,
                costUsd: 0,
            };
            this.lastUsageValue = addClaudeUsage(
                this.lastUsageValue ?? ZERO_CLAUDE_USAGE,
                turnUsage,
            );
        }
    }
}
