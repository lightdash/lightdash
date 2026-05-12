// Render the agent's runSql state as Slack blocks that get written INTO the
// bot's existing progress message (the bolt-gif "Thinking…" message at
// `slackPrompt.response_slack_ts`). One living message — pending → approved →
// running → success / error / rejected / timeout. When the agent moves on,
// the next updateProgress call overwrites with the bolt-gif again.

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
                text: { type: 'mrkdwn', text: `_${state.message}_` },
            });
            break;
        case 'rejected':
        case 'timeout':
        default:
            break;
    }

    return blocks;
};
