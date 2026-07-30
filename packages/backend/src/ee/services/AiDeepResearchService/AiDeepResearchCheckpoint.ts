import {
    type AiAgentToolCall,
    type AiAgentToolResult,
    type AiDeepResearchSubmittedReport,
} from '@lightdash/common';
import { validate as isUuid } from 'uuid';
import type { DbAiDeepResearchRun } from '../../database/entities/aiDeepResearch';
import {
    AI_DEEP_RESEARCH_HYPOTHESES_TOOL_NAME,
    AI_DEEP_RESEARCH_INVESTIGATION_TOOL_NAME,
    AI_DEEP_RESEARCH_REPORT_TOOL_NAME,
    parseAiDeepResearchReport,
} from './AiDeepResearchAgent';
import { isDeepResearchWarehouseTool } from './toolClassification';

const EVIDENCE_VALUE_MAX_CHARS = 120;
const EVIDENCE_FACTS_PER_TOOL = 6;
const MAX_EVIDENCE_TOOLS = 40;
const SENSITIVE_EVIDENCE_PATTERN =
    /(?:api[\s_-]*key|authorization|bearer|credential|password|passwd|private[\s_-]*key|secret|token)/i;
const SUBMISSION_TOOL_NAMES = new Set([
    AI_DEEP_RESEARCH_REPORT_TOOL_NAME,
    AI_DEEP_RESEARCH_HYPOTHESES_TOOL_NAME,
    AI_DEEP_RESEARCH_INVESTIGATION_TOOL_NAME,
]);

export type DeepResearchToolProvenance = {
    toolCall: AiAgentToolCall;
    toolResult: AiAgentToolResult | null;
};

const parseJson = (value: string): unknown => {
    try {
        return JSON.parse(value) as unknown;
    } catch {
        return value;
    }
};

const findStringValues = (value: unknown, key: string): string[] => {
    if (Array.isArray(value)) {
        return value.flatMap((item) => findStringValues(item, key));
    }
    if (value === null || typeof value !== 'object') {
        return [];
    }

    return Object.entries(value).flatMap(([entryKey, entryValue]) => [
        ...(entryKey === key && typeof entryValue === 'string'
            ? [entryValue]
            : []),
        ...findStringValues(entryValue, key),
    ]);
};

const hasSuccessfulResult = ({
    toolResult,
}: DeepResearchToolProvenance): boolean =>
    toolResult?.metadata?.status === 'success';

const truncate = (value: string): string =>
    value.length <= EVIDENCE_VALUE_MAX_CHARS
        ? value
        : `${value.slice(0, EVIDENCE_VALUE_MAX_CHARS)}…`;

const getSafeText = (value: string): string =>
    value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('`', "'")
        .replace(/\s+/g, ' ')
        .trim();

const getEvidenceFacts = (value: unknown, path = 'result'): string[] => {
    if (SENSITIVE_EVIDENCE_PATTERN.test(path)) {
        return [];
    }
    if (
        value === null ||
        typeof value === 'number' ||
        typeof value === 'boolean'
    ) {
        return [`${path}=${String(value)}`];
    }
    if (typeof value === 'string') {
        return [
            `${path}=${
                SENSITIVE_EVIDENCE_PATTERN.test(value)
                    ? '[REDACTED]'
                    : truncate(value)
            }`,
        ];
    }
    if (Array.isArray(value)) {
        return value
            .slice(0, 3)
            .flatMap((item, index) =>
                getEvidenceFacts(item, `${path}[${index}]`),
            )
            .slice(0, EVIDENCE_FACTS_PER_TOOL);
    }
    if (typeof value !== 'object') {
        return [];
    }

    return Object.entries(value)
        .filter(
            ([key]) =>
                key !== 'queryUuid' &&
                !/(?:metadata|schema)/i.test(key) &&
                !SENSITIVE_EVIDENCE_PATTERN.test(key),
        )
        .flatMap(([key, item]) => getEvidenceFacts(item, `${path}.${key}`))
        .slice(0, EVIDENCE_FACTS_PER_TOOL);
};

const getQueryUuids = (provenance: DeepResearchToolProvenance[]): string[] => [
    ...new Set(
        provenance.flatMap((entry) =>
            hasSuccessfulResult(entry) &&
            entry.toolResult &&
            isDeepResearchWarehouseTool(entry.toolResult.toolName)
                ? findStringValues(
                      parseJson(entry.toolResult.result),
                      'queryUuid',
                  ).filter(isUuid)
                : [],
        ),
    ),
];

const getLatestReport = (
    provenance: DeepResearchToolProvenance[],
): AiDeepResearchSubmittedReport | null => {
    const submissions = provenance
        .filter(
            ({ toolCall, toolResult }) =>
                toolCall.toolName === AI_DEEP_RESEARCH_REPORT_TOOL_NAME &&
                toolResult?.metadata?.status === 'success',
        )
        .reverse();

    const reports = submissions.flatMap((submission) => {
        try {
            return [parseAiDeepResearchReport(submission.toolCall.toolArgs)];
        } catch {
            return [];
        }
    });
    return reports[0] ?? null;
};

const getEvidencePartialReport = ({
    run,
    provenance,
    reason,
}: {
    run: DbAiDeepResearchRun;
    provenance: DeepResearchToolProvenance[];
    reason: string;
}): AiDeepResearchSubmittedReport | null => {
    const evidence = provenance
        .filter(
            (entry) =>
                hasSuccessfulResult(entry) &&
                !SUBMISSION_TOOL_NAMES.has(entry.toolCall.toolName),
        )
        .slice(-MAX_EVIDENCE_TOOLS)
        .flatMap(({ toolCall, toolResult }) =>
            toolResult
                ? getEvidenceFacts(parseJson(toolResult.result)).map(
                      (fact) =>
                          `- \`${toolCall.toolName}\`: ${truncate(
                              getSafeText(fact),
                          )}`,
                  )
                : [],
        );
    if (evidence.length === 0) {
        return null;
    }

    const queryUuids = getQueryUuids(provenance);
    return {
        markdown: `This is a partial report based only on evidence persisted before the investigation stopped. Its conclusions should be treated as incomplete.

<warning title="Incomplete investigation">

${reason}

</warning>

## Evidence collected

<confidence level="low">The evidence is incomplete because report synthesis did not pass validation.</confidence>

${evidence.join('\n')}${
            queryUuids.length > 0
                ? `\n\nWarehouse queries:\n${queryUuids
                      .map((uuid) => `- \`${uuid}\``)
                      .join('\n')}`
                : ''
        }

## Conclusion

- This partial result preserves the evidence collected for: ${getSafeText(run.prompt)}`,
        charts: [],
    };
};

export const getDeepResearchCheckpoint = ({
    run,
    provenance,
    partialReason,
}: {
    run: DbAiDeepResearchRun;
    provenance: DeepResearchToolProvenance[];
    partialReason?: string;
}): {
    report: AiDeepResearchSubmittedReport | null;
    warehouseQueryUuids: string[];
} => ({
    report:
        getLatestReport(provenance) ??
        (partialReason
            ? getEvidencePartialReport({
                  run,
                  provenance,
                  reason: partialReason,
              })
            : null),
    warehouseQueryUuids: getQueryUuids(provenance),
});
