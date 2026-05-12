#!/usr/bin/env npx tsx
/**
 * Profiles a Claude Code raw-stream.jsonl trace file to identify slow tool calls.
 *
 * Usage:
 *   npx tsx profile-trace.ts [path/to/raw-stream.jsonl]
 *
 * Defaults to ./raw-stream.jsonl if no path given.
 *
 * Produces:
 *   - Timeline of every tool call with wall-clock duration
 *   - Per-tool-type aggregate stats (count, total, avg, p50, p95, max)
 *   - Top 10 slowest individual tool calls
 *   - Time breakdown: thinking vs tool execution vs other
 */
import fs from 'node:fs';

const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';

// ---------------------------------------------------------------------------
// Parse events from JSONL
// ---------------------------------------------------------------------------
interface StreamEvent {
    type: string;
    subtype?: string;
    timestamp?: string;
    model?: string;
    message?: {
        content?: Array<{
            type: string;
            id?: string;
            name?: string;
            text?: string;
            thinking?: string;
            input?: Record<string, unknown>;
            tool_use_id?: string;
            content?: unknown;
        }>;
    };
}

interface TimedEvent {
    event: StreamEvent;
    /** Monotonic receive time (ms since first event) */
    receiveMs: number;
}

function parseEvents(filePath: string): TimedEvent[] {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const events: TimedEvent[] = [];
    let firstTs: number | null = null;

    for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        try {
            const event = JSON.parse(line) as StreamEvent;
            // Use the event's timestamp if available, otherwise use index-based ordering
            let ts = 0;
            if (event.timestamp) {
                ts = new Date(event.timestamp).getTime();
            }
            if (firstTs === null) firstTs = ts || 0;
            events.push({ event, receiveMs: ts ? ts - firstTs : events.length });
        } catch {
            // skip malformed lines
        }
    }

    // If no real timestamps, we need to infer from stream ordering.
    // Check if we got real timestamps (first few events have non-zero receiveMs spread)
    const hasRealTimestamps =
        events.length > 2 &&
        events.some((e) => e.receiveMs > 100);

    if (!hasRealTimestamps) {
        console.log(
            `${YELLOW}Warning: No real timestamps found in events. Timing data will be unavailable.${RESET}`,
        );
        console.log(
            `${YELLOW}Tip: Re-run test-generate.ts with the patched onStdout that adds timestamps.${RESET}\n`,
        );
    }

    return events;
}

// ---------------------------------------------------------------------------
// Extract tool call spans
// ---------------------------------------------------------------------------
interface ToolSpan {
    toolName: string;
    toolUseId: string;
    input: Record<string, unknown>;
    startMs: number;
    endMs: number;
    durationMs: number;
    resultPreview: string;
}

function extractToolSpans(events: TimedEvent[]): ToolSpan[] {
    // Map tool_use_id -> pending span
    const pending = new Map<
        string,
        { toolName: string; input: Record<string, unknown>; startMs: number }
    >();
    const spans: ToolSpan[] = [];

    for (const { event, receiveMs } of events) {
        if (event.type === 'assistant' && event.message?.content) {
            for (const block of event.message.content) {
                if (block.type === 'tool_use' && block.id && block.name) {
                    pending.set(block.id, {
                        toolName: block.name,
                        input: (block.input ?? {}) as Record<string, unknown>,
                        startMs: receiveMs,
                    });
                }
            }
        }

        if (event.type === 'user' && event.message?.content) {
            for (const block of event.message.content) {
                if (block.type === 'tool_result' && block.tool_use_id) {
                    const start = pending.get(block.tool_use_id);
                    if (start) {
                        const durationMs = receiveMs - start.startMs;
                        let resultPreview = '';
                        if (typeof block.content === 'string') {
                            const lines = block.content.split('\n');
                            resultPreview =
                                lines.length > 3
                                    ? `${lines.length} lines`
                                    : block.content
                                          .replace(/\n/g, ' ')
                                          .slice(0, 120);
                        }
                        spans.push({
                            toolName: start.toolName,
                            toolUseId: block.tool_use_id,
                            input: start.input,
                            startMs: start.startMs,
                            endMs: receiveMs,
                            durationMs,
                            resultPreview,
                        });
                        pending.delete(block.tool_use_id);
                    }
                }
            }
        }
    }

    // Add orphaned tool calls (no result received)
    for (const [id, start] of pending) {
        spans.push({
            toolName: start.toolName,
            toolUseId: id,
            input: start.input,
            startMs: start.startMs,
            endMs: -1,
            durationMs: -1,
            resultPreview: '(no result)',
        });
    }

    return spans.sort((a, b) => a.startMs - b.startMs);
}

// ---------------------------------------------------------------------------
// Extract phase durations (thinking, tool execution, text generation)
// ---------------------------------------------------------------------------
interface Phase {
    type: 'thinking' | 'tool_execution' | 'text' | 'gap';
    startMs: number;
    endMs: number;
    durationMs: number;
    detail?: string;
}

function extractPhases(events: TimedEvent[]): Phase[] {
    const phases: Phase[] = [];
    let lastMs = 0;

    for (const { event, receiveMs } of events) {
        if (event.type === 'assistant' && event.message?.content) {
            for (const block of event.message.content) {
                if (block.type === 'thinking' && block.thinking) {
                    phases.push({
                        type: 'thinking',
                        startMs: lastMs,
                        endMs: receiveMs,
                        durationMs: receiveMs - lastMs,
                    });
                    lastMs = receiveMs;
                } else if (block.type === 'text') {
                    phases.push({
                        type: 'text',
                        startMs: lastMs,
                        endMs: receiveMs,
                        durationMs: receiveMs - lastMs,
                    });
                    lastMs = receiveMs;
                } else if (block.type === 'tool_use') {
                    // tool_use starts; we'll close it when tool_result arrives
                }
            }
        }
    }

    return phases;
}

// ---------------------------------------------------------------------------
// Stats helpers
// ---------------------------------------------------------------------------
function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
}

function formatMs(ms: number): string {
    if (ms < 0) return 'N/A';
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const m = Math.floor(ms / 60000);
    const s = ((ms % 60000) / 1000).toFixed(0);
    return `${m}m${s}s`;
}

function formatElapsed(ms: number): string {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function toolLabel(span: ToolSpan): string {
    switch (span.toolName) {
        case 'Read':
            return String(span.input.file_path ?? '').replace('/app/', '');
        case 'Write':
            return String(span.input.file_path ?? '').replace('/app/', '');
        case 'Edit':
            return String(span.input.file_path ?? '').replace('/app/', '');
        case 'Bash':
            return String(span.input.command ?? '').slice(0, 80);
        case 'Glob':
            return String(span.input.pattern ?? '');
        case 'Grep':
            return `"${String(span.input.pattern ?? '')}"`;
        default:
            return Object.keys(span.input).join(', ');
    }
}

function durationBar(ms: number, maxMs: number, width: number = 30): string {
    if (ms < 0 || maxMs <= 0) return '';
    const filled = Math.max(1, Math.round((ms / maxMs) * width));
    const color = ms > 5000 ? RED : ms > 2000 ? YELLOW : GREEN;
    return color + '\u2588'.repeat(filled) + RESET;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
function printReport(spans: ToolSpan[], events: TimedEvent[]) {
    const totalMs =
        events.length > 1
            ? events[events.length - 1].receiveMs - events[0].receiveMs
            : 0;

    console.log(`\n${BOLD}${CYAN}=== Claude Code Sandbox Profile ===${RESET}\n`);
    console.log(`Total wall time: ${BOLD}${formatMs(totalMs)}${RESET}`);
    console.log(`Total tool calls: ${BOLD}${spans.length}${RESET}`);
    console.log(
        `Total tool time: ${BOLD}${formatMs(spans.reduce((s, t) => s + Math.max(0, t.durationMs), 0))}${RESET}`,
    );

    // -----------------------------------------------------------------------
    // 1. Timeline
    // -----------------------------------------------------------------------
    console.log(`\n${BOLD}--- Timeline ---${RESET}\n`);

    const maxDuration = Math.max(...spans.map((s) => s.durationMs));
    for (const span of spans) {
        const elapsed = formatElapsed(span.startMs);
        const dur = formatMs(span.durationMs);
        const bar = durationBar(span.durationMs, maxDuration, 25);
        const label = toolLabel(span);
        console.log(
            `  ${DIM}${elapsed}${RESET}  ${span.toolName.padEnd(10)} ${dur.padStart(8)}  ${bar}  ${DIM}${label}${RESET}`,
        );
    }

    // -----------------------------------------------------------------------
    // 2. Per-tool aggregate stats
    // -----------------------------------------------------------------------
    console.log(`\n${BOLD}--- Per-Tool Stats ---${RESET}\n`);

    const byTool = new Map<string, number[]>();
    for (const span of spans) {
        if (span.durationMs < 0) continue;
        const arr = byTool.get(span.toolName) ?? [];
        arr.push(span.durationMs);
        byTool.set(span.toolName, arr);
    }

    const toolStats = [...byTool.entries()]
        .map(([name, durations]) => {
            const sorted = durations.slice().sort((a, b) => a - b);
            return {
                name,
                count: sorted.length,
                total: sorted.reduce((a, b) => a + b, 0),
                avg: sorted.reduce((a, b) => a + b, 0) / sorted.length,
                p50: percentile(sorted, 50),
                p95: percentile(sorted, 95),
                max: sorted[sorted.length - 1],
            };
        })
        .sort((a, b) => b.total - a.total);

    const header = `  ${'Tool'.padEnd(14)} ${'Count'.padStart(6)} ${'Total'.padStart(9)} ${'Avg'.padStart(9)} ${'p50'.padStart(9)} ${'p95'.padStart(9)} ${'Max'.padStart(9)}`;
    console.log(`${BOLD}${header}${RESET}`);
    console.log(`  ${''.padEnd(header.length - 2, '-')}`);

    for (const s of toolStats) {
        console.log(
            `  ${s.name.padEnd(14)} ${String(s.count).padStart(6)} ${formatMs(s.total).padStart(9)} ${formatMs(s.avg).padStart(9)} ${formatMs(s.p50).padStart(9)} ${formatMs(s.p95).padStart(9)} ${formatMs(s.max).padStart(9)}`,
        );
    }

    // -----------------------------------------------------------------------
    // 3. Top 10 slowest tool calls
    // -----------------------------------------------------------------------
    console.log(`\n${BOLD}--- Top 10 Slowest Tool Calls ---${RESET}\n`);

    const slowest = spans
        .filter((s) => s.durationMs > 0)
        .sort((a, b) => b.durationMs - a.durationMs)
        .slice(0, 10);

    for (let i = 0; i < slowest.length; i++) {
        const span = slowest[i];
        const color = span.durationMs > 5000 ? RED : span.durationMs > 2000 ? YELLOW : GREEN;
        console.log(
            `  ${String(i + 1).padStart(2)}. ${color}${formatMs(span.durationMs).padStart(8)}${RESET}  ${span.toolName.padEnd(10)}  ${DIM}${toolLabel(span)}${RESET}`,
        );
    }

    // -----------------------------------------------------------------------
    // 4. Edit-specific deep dive (the suspected bottleneck)
    // -----------------------------------------------------------------------
    const edits = spans.filter((s) => s.toolName === 'Edit' && s.durationMs > 0);
    if (edits.length > 0) {
        console.log(`\n${BOLD}--- Edit Tool Deep Dive ---${RESET}\n`);

        const editTotal = edits.reduce((s, e) => s + e.durationMs, 0);
        const editPct = totalMs > 0 ? ((editTotal / totalMs) * 100).toFixed(1) : '?';
        console.log(`  Edit calls: ${edits.length}`);
        console.log(`  Edit total time: ${formatMs(editTotal)} (${editPct}% of wall time)`);
        console.log(
            `  Edit avg: ${formatMs(editTotal / edits.length)}`,
        );

        console.log(`\n  ${'File'.padEnd(40)} ${'Duration'.padStart(10)}  ${'Lines -/+'.padStart(12)}`);
        console.log(`  ${''.padEnd(65, '-')}`);
        for (const edit of edits.sort((a, b) => b.durationMs - a.durationMs)) {
            const file = String(edit.input.file_path ?? '').replace('/app/', '');
            const oldLines = String(edit.input.old_string ?? '').split('\n').length;
            const newLines = String(edit.input.new_string ?? '').split('\n').length;
            const color = edit.durationMs > 5000 ? RED : edit.durationMs > 2000 ? YELLOW : GREEN;
            console.log(
                `  ${file.padEnd(40)} ${color}${formatMs(edit.durationMs).padStart(10)}${RESET}  ${`-${oldLines}/+${newLines}`.padStart(12)}`,
            );
        }
    }

    // -----------------------------------------------------------------------
    // 5. Time breakdown
    // -----------------------------------------------------------------------
    console.log(`\n${BOLD}--- Time Breakdown ---${RESET}\n`);

    const toolTime = spans
        .filter((s) => s.durationMs > 0)
        .reduce((s, t) => s + t.durationMs, 0);
    const nonToolTime = Math.max(0, totalMs - toolTime);

    const barWidth = 50;
    const toolPct = totalMs > 0 ? toolTime / totalMs : 0;
    const nonToolPct = 1 - toolPct;

    console.log(
        `  Tool execution:  ${formatMs(toolTime).padStart(9)} (${(toolPct * 100).toFixed(1)}%)  ${GREEN}${'|'.repeat(Math.round(toolPct * barWidth))}${RESET}`,
    );
    console.log(
        `  LLM / overhead:  ${formatMs(nonToolTime).padStart(9)} (${(nonToolPct * 100).toFixed(1)}%)  ${CYAN}${'|'.repeat(Math.round(nonToolPct * barWidth))}${RESET}`,
    );

    // Per-tool share
    console.log('');
    for (const s of toolStats) {
        const pct = totalMs > 0 ? s.total / totalMs : 0;
        const bar = GREEN + '|'.repeat(Math.max(1, Math.round(pct * barWidth))) + RESET;
        console.log(
            `  ${s.name.padEnd(14)} ${formatMs(s.total).padStart(9)} (${(pct * 100).toFixed(1)}%)  ${bar}`,
        );
    }

    console.log('');
}

// ---------------------------------------------------------------------------
// Timestamped JSONL wrapper for test-generate.ts
// ---------------------------------------------------------------------------
function printTimestampPatch() {
    console.log(`\n${BOLD}--- Tip: Add timestamps to raw-stream.jsonl ---${RESET}\n`);
    console.log(`To get accurate timing, patch the onStdout callback in test-generate.ts:`);
    console.log(`
  onStdout: (data) => {
      // Inject receive timestamp into each JSON line for profiling
      const str = String(data);
      const timestamped = str.split('\\n').map(line => {
          if (!line.trim()) return line;
          try {
              const obj = JSON.parse(line);
              obj.timestamp = new Date().toISOString();
              return JSON.stringify(obj);
          } catch { return line; }
      }).join('\\n');
      fs.appendFileSync('raw-stream.jsonl', timestamped + '\\n');
      processStreamLines(str);
  },
`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const filePath = process.argv[2] || 'raw-stream.jsonl';

if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    console.error(`\nRun test-generate.ts first to produce a raw-stream.jsonl trace file.`);
    process.exit(1);
}

const events = parseEvents(filePath);
const spans = extractToolSpans(events);

if (spans.length === 0) {
    console.error('No tool calls found in the trace file.');
    process.exit(1);
}

printReport(spans, events);

// Check if timestamps were present
const hasTimestamps = events.some(
    (e) => e.event.timestamp && e.receiveMs > 100,
);
if (!hasTimestamps) {
    printTimestampPatch();
}
