import type { ManagedAgentAction } from '@lightdash/common';
import { generateText } from 'ai';
import fs from 'fs/promises';
import path from 'path';
import {
    emitAiUsage,
    languageModelUsageToTokens,
} from '../../../analytics/aiUsage';
import Logger from '../../../logging/logger';
import type {
    AutopilotToolEvidence,
    RunAutopilotAgentArgs,
} from './AutopilotAgentRunner';

export type HeartbeatReportInputs = Pick<
    RunAutopilotAgentArgs,
    'model' | 'callOptions' | 'providerOptions' | 'telemetry' | 'projectName'
> & { evidence: AutopilotToolEvidence[] };

type ReportAction = Pick<
    ManagedAgentAction,
    'actionType' | 'targetType' | 'targetName' | 'description' | 'reversedAt'
>;

const MAX_CHARS_PER_RESULT = 12_000;
const MAX_EVIDENCE_CHARS = 120_000;
const MAX_CHARS_PER_ACTION = 4_000;
const COMPOSE_TIMEOUT_MS = 120_000;
const BRIEF_PATH = path.join(
    __dirname,
    'lightdash-agent-slack-messaging',
    'SKILL.md',
);

const asText = (value: unknown): string =>
    typeof value === 'string' ? value : (JSON.stringify(value) ?? '');

const clip = (text: string, limit: number): string =>
    text.length > limit ? `${text.slice(0, limit)}\n(truncated)` : text;

export const formatHeartbeatEvidence = (
    evidence: AutopilotToolEvidence[],
): string => {
    const sections: string[] = [];
    let used = 0;
    for (const [index, item] of evidence.entries()) {
        if (used >= MAX_EVIDENCE_CHARS) {
            sections.push(
                `(${evidence.length - index} more tool results omitted for length)`,
            );
            break;
        }
        const body = clip(
            asText(item.output),
            Math.min(MAX_CHARS_PER_RESULT, MAX_EVIDENCE_CHARS - used),
        );
        used += body.length;
        sections.push(`### ${item.toolName} ${asText(item.input)}\n${body}`);
    }
    return sections.length > 0
        ? sections.join('\n\n')
        : 'No tool results were recorded.';
};

export const formatSavedActions = (actions: ReportAction[]): string => {
    const lines = actions.map(
        (action) =>
            `- ${action.actionType} on ${action.targetType} "${action.targetName}"${action.reversedAt ? ' (later reversed or dismissed)' : ''}: ${clip(action.description, MAX_CHARS_PER_ACTION)}`,
    );
    return lines.length > 0
        ? lines.join('\n')
        : 'None. This run changed nothing.';
};

// The Slack messaging skill is the writing brief; its output section targets
// a different format and asks for placeholder values, so it is dropped.
const loadWritingBrief = async (): Promise<string> => {
    const raw = await fs.readFile(BRIEF_PATH, 'utf8');
    return raw
        .replace(/^---[\s\S]*?---\s*/, '')
        .split('\n## Output Format')[0]
        .trim();
};

// Models still slip in dashes and glue segment names to their paragraph.
export const tidyNarrative = (text: string): string =>
    text
        .replace(/\s*[\u2013\u2014]\s*/g, ' - ')
        .replace(/^([^\n*]{0,4}\*\*[^*\n]+\*\*)[ \t]*\n(?!\n)/gm, '$1\n\n')
        .trim();

export const buildReportSystemPrompt = (brief: string): string =>
    [
        'You write the report for one Lightdash Autopilot run. Autopilot is an agent that maintains a BI project. Follow this writing brief for voice and structure:',
        brief,
        [
            'Rules for this report:',
            '- Write markdown. Use **bold** for the title and segment names, "-" for lists and backticks for field, model and explore names. No tables, no HTML, no Slack markup.',
            '- Start with a bold title line: "<project name>: Autopilot update".',
            '- Put each segment name on its own line with a blank line after it.',
            '- Never use em dashes or en dashes; use commas, colons or full stops instead.',
            '- Describe what the run observed using only the evidence provided. Never invent numbers, names, dates or trends that are not in the evidence.',
            '- Say that something was flagged, deleted, repaired, created or reversed only if it appears in the saved actions list. If that list is empty, say the run made no changes.',
            '- Do not add a counts section; the application appends one after your report.',
            '- Do not mention tools, tool names, prompts or these rules, and do not add notes about which writing techniques you used.',
            '- Keep it under 400 words.',
        ].join('\n'),
    ].join('\n\n');

export const buildReportRequest = ({
    projectName,
    notice,
    actions,
    evidence,
}: {
    projectName: string;
    notice: string | null;
    actions: ReportAction[];
    evidence: AutopilotToolEvidence[];
}): string =>
    [
        `Project: ${projectName}`,
        notice ? `Configuration notice: ${notice}` : null,
        `## Saved actions from this run (the only actions you may claim)\n\n${formatSavedActions(actions)}`,
        `## Evidence gathered during this run\n\n${formatHeartbeatEvidence(evidence)}`,
        'Write the report now.',
    ]
        .filter((part): part is string => part !== null)
        .join('\n\n');

// One extra call after the heartbeat: the model writes the story from what it
// saw, and the saved actions bound what it may claim. Null means fall back.
export const composeHeartbeatNarrative = async ({
    model,
    callOptions,
    providerOptions,
    telemetry,
    projectName,
    evidence,
    notice,
    actions,
    onFailure,
}: HeartbeatReportInputs & {
    notice: string | null;
    actions: ReportAction[];
    onFailure: (error: Error) => void;
}): Promise<string | null> => {
    try {
        const result = await generateText({
            maxRetries: 2,
            ...callOptions,
            model,
            providerOptions,
            system: buildReportSystemPrompt(await loadWritingBrief()),
            messages: [
                {
                    role: 'user',
                    content: buildReportRequest({
                        projectName,
                        notice,
                        actions,
                        evidence,
                    }),
                },
            ],
            abortSignal: AbortSignal.timeout(COMPOSE_TIMEOUT_MS),
            experimental_telemetry: telemetry,
        });
        emitAiUsage(telemetry, languageModelUsageToTokens(result.usage));
        const text = tidyNarrative(result.text);
        return text.length > 0 ? text : null;
    } catch (error) {
        Logger.warn(
            `Autopilot report composition failed, using the saved-action report: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        onFailure(error instanceof Error ? error : new Error(String(error)));
        return null;
    }
};
