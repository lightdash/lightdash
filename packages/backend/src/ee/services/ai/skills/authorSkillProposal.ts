import {
    AI_AGENT_SKILL_NAME_MAX_LENGTH,
    AI_AGENT_SKILL_RESERVED_NAME_PREFIX,
    aiAgentReviewClassifierJudgeSkillProposalCallSchema,
    isValidAiAgentSkillName,
    type AiAgentJudgeSkillProposal,
    type AiAgentReviewClassifierJudgeOutput,
    type AiAgentSkillSnapshot,
} from '@lightdash/common';
import { generateText, Output } from 'ai';
import {
    emitAiUsage,
    languageModelUsageToTokens,
} from '../../../../analytics/aiUsage';
import type { AiAgentReviewJudgeEvidencePacket } from '../../AiAgentReviewClassifierService';
import { defaultAgentOptions } from '../agents/agentV2';
import type { getModel } from '../models';
import type { getAiCallTelemetry } from '../utils/aiCallTelemetry';

type TurnFinding = Pick<
    AiAgentReviewClassifierJudgeOutput,
    | 'reviewItem'
    | 'promotionReason'
    | 'subcategories'
    | 'recommendation'
    | 'evidenceExcerpts'
>;

export type SkillProposalAuthoringEvidence = {
    evidencePacket: AiAgentReviewJudgeEvidencePacket;
    finding: TurnFinding;
    existingSkills: AiAgentSkillSnapshot[];
};

type AuthoringMessage = {
    role: 'system' | 'user';
    content: string;
};

type AuthoringLlmCallArgs = {
    model: ReturnType<typeof getModel>;
    telemetry: ReturnType<typeof getAiCallTelemetry>;
    messages: AuthoringMessage[];
};

export type SkillProposalAuthoringLlmCall = (
    args: AuthoringLlmCallArgs,
) => Promise<unknown>;

const callAuthoringLlm: SkillProposalAuthoringLlmCall = async ({
    model,
    telemetry,
    messages,
}) => {
    const result = await generateText({
        model: model.model,
        ...defaultAgentOptions,
        ...model.callOptions,
        providerOptions: model.providerOptions,
        ...telemetry,
        output: Output.object({
            schema: aiAgentReviewClassifierJudgeSkillProposalCallSchema,
        }),
        allowSystemInMessages: true,
        messages,
    });
    emitAiUsage(telemetry, languageModelUsageToTokens(result.usage));
    return result.output;
};

const systemPrompt = `You draft a reusable skill for a Lightdash AI agent from a review finding whose recommendation is create_skill: the user keeps steering the agent through the same procedure or presentation convention, and an admin will review this draft before saving it.

Set skillProposal to null when the steer is a one-off, is already covered by one of existingSkills, or is really a business definition (that belongs in project context, not a skill).

Otherwise fill every field:
- name: the slash command. Lowercase letters, digits and single hyphens only, at most ${AI_AGENT_SKILL_NAME_MAX_LENGTH} characters, never starting with "${AI_AGENT_SKILL_RESERVED_NAME_PREFIX}". Name the procedure, not the data ("weekly-revenue-table", not "revenue").
- description: one sentence, under 200 characters, saying when the agent should load this skill. The agent matches requests against it, so lead with the trigger ("Use when the user asks for ...").
- instructions: markdown the agent follows, with a "## When to use" section and a numbered "## Steps" section. Use $ARGUMENTS where the user would pass a parameter (a region, a period, a customer). State only what the evidence shows the user asked for, in the order they asked for it. Never invent fields, explores, filters or formats that do not appear in the evidence.

The evidence packet field recentSimilarPrompts lists other threads that asked for the same procedure. Use them to tell the fixed part of the procedure (goes in Steps) from what varies between requests (becomes $ARGUMENTS, typically the period or the segment).`;

const buildAuthoringMessages = (
    evidence: SkillProposalAuthoringEvidence,
): AuthoringMessage[] => [
    { role: 'system', content: systemPrompt },
    {
        role: 'user',
        content: JSON.stringify(
            {
                evidencePacket: evidence.evidencePacket,
                finding: evidence.finding,
                existingSkills: evidence.existingSkills,
            },
            null,
            2,
        ),
    },
];

const isUsableProposal = (
    proposal: AiAgentJudgeSkillProposal,
    existingSkills: AiAgentSkillSnapshot[],
): boolean =>
    isValidAiAgentSkillName(proposal.name) &&
    !proposal.name.startsWith(AI_AGENT_SKILL_RESERVED_NAME_PREFIX) &&
    !existingSkills.some((skill) => skill.name === proposal.name);

export const authorSkillProposal = async ({
    evidence,
    model,
    telemetry,
    authoringLlmCall = callAuthoringLlm,
}: {
    evidence: SkillProposalAuthoringEvidence;
    model: ReturnType<typeof getModel>;
    telemetry: ReturnType<typeof getAiCallTelemetry>;
    authoringLlmCall?: SkillProposalAuthoringLlmCall;
}): Promise<AiAgentJudgeSkillProposal | null> => {
    const output = await authoringLlmCall({
        model,
        telemetry,
        messages: buildAuthoringMessages(evidence),
    });
    const { skillProposal } =
        aiAgentReviewClassifierJudgeSkillProposalCallSchema.parse(output);

    return skillProposal &&
        isUsableProposal(skillProposal, evidence.existingSkills)
        ? skillProposal
        : null;
};
