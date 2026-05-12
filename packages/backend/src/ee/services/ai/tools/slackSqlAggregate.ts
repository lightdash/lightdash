// Aggregates all runSql interactions in a single Slack prompt into ONE message
// that's updated in place via chat.update — instead of posting a fresh message
// for every approval card + result. Per-pod in-memory state, lost on restart
// (next runSql posts a new aggregate message; degrades gracefully).

import type { AnyType } from '@lightdash/common';

export type SectionState =
    | { kind: 'pending'; sql: string }
    | { kind: 'approved'; sql: string }
    | { kind: 'running'; sql: string }
    | {
          kind: 'success';
          sql: string;
          rowCount: number;
          inlineCsv: string;
          truncated: boolean;
      }
    | { kind: 'rejected'; sql: string }
    | { kind: 'timeout'; sql: string }
    | { kind: 'error'; sql: string; message: string };

export type AggregateSection = {
    toolCallId: string;
    threadUuid: string;
    state: SectionState;
};

export type Aggregate = {
    channelId: string;
    messageTs: string;
    sections: AggregateSection[];
};

const aggregates = new Map<string, Aggregate>();

export const getAggregate = (promptUuid: string): Aggregate | undefined =>
    aggregates.get(promptUuid);

export const setAggregate = (promptUuid: string, agg: Aggregate): void => {
    aggregates.set(promptUuid, agg);
};

export const upsertSection = (
    promptUuid: string,
    section: AggregateSection,
): void => {
    const agg = aggregates.get(promptUuid);
    if (!agg) return;
    const idx = agg.sections.findIndex(
        (s) => s.toolCallId === section.toolCallId,
    );
    if (idx === -1) {
        agg.sections.push(section);
    } else {
        agg.sections[idx] = section;
    }
};

const truncateSql = (sql: string, maxLength = 2500) =>
    sql.length > maxLength
        ? `${sql.slice(0, maxLength)}\n... (truncated)`
        : sql;

const oneLineSql = (sql: string, maxLength = 120) => {
    const flat = sql.replace(/\s+/g, ' ').trim();
    return flat.length > maxLength ? `${flat.slice(0, maxLength)}…` : flat;
};

const sectionHeader = (idx: number, state: SectionState): string => {
    const step = `*Step ${idx + 1}*`;
    switch (state.kind) {
        case 'pending':
            return `:lock: ${step} — awaiting approval`;
        case 'approved':
            return `:hourglass_flowing_sand: ${step} — approved, running…`;
        case 'running':
            return `:hourglass_flowing_sand: ${step} — running…`;
        case 'success':
            return `:white_check_mark: ${step} — ${state.rowCount} row${
                state.rowCount === 1 ? '' : 's'
            }${state.truncated ? ' _(preview)_' : ''}`;
        case 'rejected':
            return `:no_entry_sign: ${step} — rejected`;
        case 'timeout':
            return `:hourglass: ${step} — approval timed out`;
        case 'error':
            return `:x: ${step} — error`;
        default:
            return step;
    }
};

const renderActiveSection = (section: AggregateSection): AnyType[] => {
    const { state, toolCallId, threadUuid } = section;
    const blocks: AnyType[] = [];

    switch (state.kind) {
        case 'pending':
            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `\`\`\`sql\n${truncateSql(state.sql)}\n\`\`\``,
                },
            });
            blocks.push({
                type: 'actions',
                elements: [
                    {
                        type: 'button',
                        text: { type: 'plain_text', text: 'Approve' },
                        action_id: `actions.sql_approval:${toolCallId}:${threadUuid}:approved`,
                        value: toolCallId,
                        style: 'primary',
                    },
                    {
                        type: 'button',
                        text: {
                            type: 'plain_text',
                            text: "Approve & don't ask again",
                        },
                        action_id: `actions.sql_approval:${toolCallId}:${threadUuid}:approved_always`,
                        value: toolCallId,
                    },
                    {
                        type: 'button',
                        text: { type: 'plain_text', text: 'Reject' },
                        action_id: `actions.sql_approval:${toolCallId}:${threadUuid}:rejected`,
                        value: toolCallId,
                        style: 'danger',
                    },
                ],
            });
            break;
        case 'approved':
        case 'running':
            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `\`\`\`sql\n${truncateSql(state.sql)}\n\`\`\``,
                },
            });
            break;
        case 'success':
            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `\`\`\`\n${state.inlineCsv}\n\`\`\``,
                },
            });
            break;
        case 'rejected':
        case 'timeout':
            blocks.push({
                type: 'context',
                elements: [
                    {
                        type: 'mrkdwn',
                        text: `_${oneLineSql(state.sql)}_`,
                    },
                ],
            });
            break;
        case 'error':
            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `_${state.message}_\n\`\`\`sql\n${truncateSql(state.sql)}\n\`\`\``,
                },
            });
            break;
        default:
            break;
    }

    return blocks;
};

// Past sections collapse to JUST the header line — no body. Keeps the
// message scannable: one row per completed step.
const renderCollapsedSection = (_section: AggregateSection): AnyType[] => [];

// Slack hard-caps a message at 50 blocks. Keep the latest sections fully
// rendered; older ones collapse to a single context line. If we still exceed
// the cap, drop the oldest collapsed sections from rendering (state is kept
// in the map but not shown — they were terminal anyway).
const MAX_BLOCKS = 48;

export const renderAggregateBlocks = (agg: Aggregate): AnyType[] => {
    const blocks: AnyType[] = [];
    const total = agg.sections.length;

    agg.sections.forEach((section, idx) => {
        const isLast = idx === total - 1;
        const isLastBeforeActive = idx === total - 2;
        blocks.push({
            type: 'section',
            text: { type: 'mrkdwn', text: sectionHeader(idx, section.state) },
        });
        if (isLast) {
            blocks.push(...renderActiveSection(section));
        } else {
            blocks.push(...renderCollapsedSection(section));
        }
        // One divider, only between the past section stack and the active
        // section — gives visual separation without cluttering the list.
        if (isLastBeforeActive) blocks.push({ type: 'divider' });
    });

    if (blocks.length <= MAX_BLOCKS) return blocks;

    // Trim from the front (oldest collapsed sections) until we fit.
    while (blocks.length > MAX_BLOCKS) blocks.shift();
    blocks.unshift({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: '_(earlier steps collapsed)_' }],
    });
    return blocks;
};
