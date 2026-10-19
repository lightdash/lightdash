// Render the agent's runSql state INTO the bot's existing progress message
// (the bolt-gif "Thinking…" message at `slackPrompt.response_slack_ts`).
//
// Visual rule: every state except `pending` reuses the same subtle bolt-gif +
// grey italic treatment that the rest of the agent's progress messages use,
// so the SQL flow blends into the agent's normal "I'm working" stream. The
// pending state is the one exception — it's a prominent section + buttons
// because we need user action before going further.

import {
    assertUnreachable,
    QuerySourceType,
    type AiPrompt,
    type AnyType,
} from '@lightdash/common';
import { getThinkingBlocks } from '../utils/getSlackBlocks';
import { type NativeSqlApprovalToolName } from './sqlApprovals';

export type SqlApprovalStep = {
    title: string;
    description: string | null;
    sql: string;
};

/** What the approval card shows: one SQL block, or one block per pipeline step. */
export type SqlApprovalDisplay =
    | { kind: 'sql'; sql: string }
    | { kind: 'steps'; steps: SqlApprovalStep[]; threadUrl: string };

export const getAgentThreadUrl = (
    siteUrl: string,
    prompt: Pick<AiPrompt, 'projectUuid' | 'agentUuid' | 'threadUuid'>,
): string =>
    prompt.agentUuid
        ? `${siteUrl}/projects/${prompt.projectUuid}/ai-agents/${prompt.agentUuid}/threads/${prompt.threadUuid}`
        : siteUrl;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

/** The warehouse `sql` steps a composer call submits, as the approval card shows them. */
const getComposerSqlApprovalSteps = (toolArgs: unknown): SqlApprovalStep[] => {
    const queries =
        isRecord(toolArgs) && Array.isArray(toolArgs.queries)
            ? toolArgs.queries
            : [];
    return queries
        .filter(
            (node): node is Record<string, unknown> & { sql: string } =>
                isRecord(node) &&
                node.sourceType === QuerySourceType.SQL &&
                typeof node.sql === 'string',
        )
        .map((node, index) => ({
            title:
                typeof node.title === 'string' && node.title.trim()
                    ? node.title
                    : `SQL step ${index + 1}`,
            description:
                typeof node.description === 'string' && node.description.trim()
                    ? node.description
                    : null,
            sql: node.sql,
        }));
};

/** Steps the card lists one by one; null shows the call's SQL as one block. */
export const getSqlApprovalSteps = (
    toolName: NativeSqlApprovalToolName,
    toolArgs: unknown,
): SqlApprovalStep[] | null => {
    switch (toolName) {
        case 'runComposerQueries':
            return getComposerSqlApprovalSteps(toolArgs);
        case 'runSql':
        case 'createContent':
        case 'editContent':
            return null;
        default:
            return assertUnreachable(toolName, 'Unknown SQL approval tool');
    }
};

export const getSqlApprovalDisplay = ({
    sql,
    steps,
    threadUrl,
}: {
    sql: string;
    steps: SqlApprovalStep[] | null;
    threadUrl: string;
}): SqlApprovalDisplay =>
    steps === null ? { kind: 'sql', sql } : { kind: 'steps', steps, threadUrl };

export type SectionState =
    | {
          kind: 'pending';
          display: SqlApprovalDisplay;
          toolCallId: string;
          threadUuid: string;
          heading: string;
          // Native AI-SDK approval cards carry a `:native` action suffix so the
          // button handler enqueues a resume job (vs the legacy blocking poll).
          native?: boolean;
      }
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

// Keeps the card within Slack's 50-block limit.
export const MAX_SQL_APPROVAL_STEPS = 15;

const escapeMrkdwn = (text: string) =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const sqlCodeBlock = (sql: string): AnyType => ({
    type: 'section',
    text: {
        type: 'mrkdwn',
        text: `\`\`\`sql\n${truncateSql(sql)}\n\`\`\``,
    },
});

const renderSqlDisplay = (display: SqlApprovalDisplay): AnyType[] => {
    if (display.kind === 'sql') return [sqlCodeBlock(display.sql)];
    const shown = display.steps.slice(0, MAX_SQL_APPROVAL_STEPS);
    const hiddenCount = display.steps.length - shown.length;
    return [
        ...shown.flatMap((step) => [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: [
                        `*${escapeMrkdwn(step.title)}*`,
                        ...(step.description === null
                            ? []
                            : [escapeMrkdwn(step.description)]),
                    ].join('\n'),
                },
            },
            sqlCodeBlock(step.sql),
        ]),
        ...(hiddenCount > 0
            ? [
                  {
                      type: 'section',
                      text: {
                          type: 'mrkdwn',
                          text: `+${hiddenCount} more SQL step${
                              hiddenCount === 1 ? '' : 's'
                          } — <${display.threadUrl}|view in app>`,
                      },
                  },
              ]
            : []),
    ];
};

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
        const suffix = state.native ? ':native' : '';
        const actionId = (decision: string) =>
            `actions.sql_approval:${state.toolCallId}:${state.threadUuid}:${decision}${suffix}`;
        // Prominent block — user action required, can't be a context block
        // (Slack disallows buttons in context blocks).
        return [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `:lock: *${state.heading}*`,
                },
            },
            ...renderSqlDisplay(state.display),
            {
                type: 'actions',
                elements: [
                    {
                        type: 'button',
                        text: { type: 'plain_text', text: 'Approve' },
                        action_id: actionId('approved'),
                        value: state.toolCallId,
                        style: 'primary',
                    },
                    {
                        type: 'button',
                        text: {
                            type: 'plain_text',
                            text: "Approve & don't ask again",
                        },
                        action_id: actionId('approved_always'),
                        value: state.toolCallId,
                    },
                    {
                        type: 'button',
                        text: { type: 'plain_text', text: 'Reject' },
                        action_id: actionId('rejected'),
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
