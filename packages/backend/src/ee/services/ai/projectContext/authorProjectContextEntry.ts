import {
    aiAgentReviewClassifierJudgeProjectContextCallSchema,
    type AiAgentJudgeProjectContextEntry,
    type ProjectContextEntry,
} from '@lightdash/common';
import type { AiAgentReviewJudgeEvidencePacket } from '../../AiAgentReviewClassifierService';
import type { getModel } from '../models';
import type { getAiCallTelemetry } from '../utils/aiCallTelemetry';
import {
    createAuthoringLlmCall,
    type AuthoringLlmCall,
    type AuthoringMessage,
    type ReviewTurnFinding,
} from '../utils/reviewAuthoring';

export type ProjectContextEntryAuthoringEvidence = {
    type: 'turn';
    evidencePacket: AiAgentReviewJudgeEvidencePacket;
    finding: ReviewTurnFinding;
};

const callAuthoringLlm = createAuthoringLlmCall(
    aiAgentReviewClassifierJudgeProjectContextCallSchema,
);

const turnSystemPrompt = `You emit the structured living-document entry for a Lightdash AI review finding whose root cause is project_context.

Set projectContextEntry ONLY when a single durable, project-specific fact (a business definition or acronym, routing/join guidance, or object-scoped context) would prevent this class of failure in future turns. Otherwise set it to null.
- op: "update" if a current project context entry is present but insufficient (reference its id); otherwise "create".
- id: the existing entry id when op="update", otherwise null.
- kind: definition | context. Use "definition" for acronyms and business vocabulary ("X means Y"); use "context" for everything else (routing/join rules, guidance, durable object-scoped facts).
- content: a single self-contained sentence stating the fact (e.g. '"HR" = the high-risk diabetes cohort, not human resources.').
- terms: the prompt-facing trigger words/phrases that should surface this entry (e.g. ["HR","high risk"]). Required for definitions.
- objects: typed semantic object refs derived from the finding's targetRefs. For an explore use {"type":"explore","name":"payments"}. For a field use {"type":"field","explore":"payments","fieldId":"payments_total_amount"}; the owning explore is required and must be one where that field exists. Use [] when purely prompt-driven.

Use only the supplied evidence packet, finding, and current project context entries. Do not invent project fields or facts.`;

const buildAuthoringMessages = ({
    evidence,
    currentEntries,
}: {
    evidence: ProjectContextEntryAuthoringEvidence;
    currentEntries: ProjectContextEntry[];
}): AuthoringMessage[] => [
    { role: 'system', content: turnSystemPrompt },
    {
        role: 'user',
        content: JSON.stringify(
            {
                evidencePacket: evidence.evidencePacket,
                finding: evidence.finding,
                currentProjectContextEntries: currentEntries,
            },
            null,
            2,
        ),
    },
];

export const authorProjectContextEntry = async ({
    evidence,
    currentEntries,
    model,
    telemetry,
    authoringLlmCall = callAuthoringLlm,
}: {
    evidence: ProjectContextEntryAuthoringEvidence;
    currentEntries: ProjectContextEntry[];
    model: ReturnType<typeof getModel>;
    telemetry: ReturnType<typeof getAiCallTelemetry>;
    authoringLlmCall?: AuthoringLlmCall;
}): Promise<AiAgentJudgeProjectContextEntry | null> => {
    const output = await authoringLlmCall({
        model,
        telemetry,
        messages: buildAuthoringMessages({ evidence, currentEntries }),
    });

    return aiAgentReviewClassifierJudgeProjectContextCallSchema.parse(output)
        .projectContextEntry;
};
