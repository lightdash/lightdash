// Single living Slack message per prompt — when the agent calls runSql we
// post a status block, then mutate it in place as the call progresses
// (pending → approved → running → success/error/rejected/timeout). The next
// runSql in the same prompt reuses the same message, replacing the body with
// the new call's state. No section history is kept in Slack — past calls
// remain in the DB + web thread for audit.
//
// Per-pod in-memory state, lost on pod restart (next runSql posts a fresh
// message and we lose continuity — degrades gracefully).

import type { AnyType } from '@lightdash/common';

export type SectionState =
    | { kind: 'pending'; sql: string; toolCallId: string; threadUuid: string }
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

export type Aggregate = {
    channelId: string;
    messageTs: string;
    current: SectionState;
};

const aggregates = new Map<string, Aggregate>();

export const getAggregate = (promptUuid: string): Aggregate | undefined =>
    aggregates.get(promptUuid);

export const setAggregate = (promptUuid: string, agg: Aggregate): void => {
    aggregates.set(promptUuid, agg);
};

export const setCurrentState = (
    promptUuid: string,
    state: SectionState,
): Aggregate | undefined => {
    const agg = aggregates.get(promptUuid);
    if (!agg) return undefined;
    agg.current = state;
    return agg;
};

const truncateSql = (sql: string, maxLength = 2500) =>
    sql.length > maxLength
        ? `${sql.slice(0, maxLength)}\n... (truncated)`
        : sql;

const header = (state: SectionState): string => {
    switch (state.kind) {
        case 'pending':
            return ':lock: *Awaiting approval to run SQL*';
        case 'approved':
            return ':hourglass_flowing_sand: *Approved — running…*';
        case 'running':
            return ':hourglass_flowing_sand: *Running SQL query…*';
        case 'success':
            return `:white_check_mark: *${state.rowCount} row${
                state.rowCount === 1 ? '' : 's'
            }*${state.truncated ? ' _(preview)_' : ''}`;
        case 'rejected':
            return ':no_entry_sign: *Rejected*';
        case 'timeout':
            return ':hourglass: *Approval timed out*';
        case 'error':
            return ':x: *Error*';
        default:
            return '';
    }
};

export const renderBlocks = (state: SectionState): AnyType[] => {
    const blocks: AnyType[] = [
        {
            type: 'section',
            text: { type: 'mrkdwn', text: header(state) },
        },
    ];

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
                        action_id: `actions.sql_approval:${state.toolCallId}:${state.threadUuid}:approved`,
                        value: state.toolCallId,
                        style: 'primary',
                    },
                    {
                        type: 'button',
                        text: {
                            type: 'plain_text',
                            text: "Approve & don't ask again",
                        },
                        action_id: `actions.sql_approval:${state.toolCallId}:${state.threadUuid}:approved_always`,
                        value: state.toolCallId,
                    },
                    {
                        type: 'button',
                        text: { type: 'plain_text', text: 'Reject' },
                        action_id: `actions.sql_approval:${state.toolCallId}:${state.threadUuid}:rejected`,
                        value: state.toolCallId,
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
            if (state.inlineCsv) {
                blocks.push({
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `\`\`\`\n${state.inlineCsv}\n\`\`\``,
                    },
                });
            }
            break;
        case 'error':
            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `_${state.message}_`,
                },
            });
            break;
        case 'rejected':
        case 'timeout':
        default:
            break;
    }

    return blocks;
};
