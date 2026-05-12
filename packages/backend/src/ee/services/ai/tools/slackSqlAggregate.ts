// Render the agent's runSql state INTO the bot's existing progress message
// (the bolt-gif "Thinking…" message at `slackPrompt.response_slack_ts`).
//
// Visual rule: every state except `pending` reuses the same subtle bolt-gif +
// grey italic treatment that the rest of the agent's progress messages use,
// so the SQL flow blends into the agent's normal "I'm working" stream. The
// pending state is the one exception — it's a prominent section + buttons
// because we need user action before going further.

import type { AnyType } from '@lightdash/common';
import { getThinkingBlocks } from '../utils/getSlackBlocks';

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

const oneLineSql = (sql: string, maxLength = 140) => {
    const flat = sql.replace(/\s+/g, ' ').trim();
    return flat.length > maxLength ? `${flat.slice(0, maxLength)}…` : flat;
};

const subtleText = (state: SectionState): string | null => {
    switch (state.kind) {
        case 'approved':
            return `Running SQL: \`${oneLineSql(state.sql)}\``;
        case 'running':
            return `Running SQL: \`${oneLineSql(state.sql)}\``;
        case 'success':
            return `Ran SQL: \`${oneLineSql(state.sql)}\``;
        case 'rejected':
            return `Rejected SQL: \`${oneLineSql(state.sql)}\``;
        case 'timeout':
            return 'SQL approval timed out';
        case 'error':
            return `SQL error — ${state.message}`;
        default:
            return null;
    }
};

export const renderBlocks = (
    state: SectionState,
    siteUrl: string,
): AnyType[] => {
    if (state.kind === 'pending') {
        // Prominent block — user action required, can't be a context block
        // (Slack disallows buttons in context blocks).
        return [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: ':lock: *Awaiting approval to run SQL*',
                },
            },
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `\`\`\`sql\n${truncateSql(state.sql)}\n\`\`\``,
                },
            },
            {
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
            },
        ];
    }

    // Every other state: reuse the agent's existing bolt-gif + grey italic
    // treatment via getThinkingBlocks so it blends with normal progress.
    const text = subtleText(state) ?? '';
    return getThinkingBlocks(text, siteUrl);
};
