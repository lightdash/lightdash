import { lightdashConfigMock } from '../../../../config/lightdashConfig.mock';
import type { AiAgentReviewJudgeEvidencePacket } from '../../AiAgentReviewClassifierService';
import { getModel } from '../models';
import { getAiCallTelemetry } from '../utils/aiCallTelemetry';
import {
    authorSkillProposal,
    type SkillProposalAuthoringEvidence,
} from './authorSkillProposal';

const evidencePacket: AiAgentReviewJudgeEvidencePacket = {
    subject: {
        type: 'turn_review',
        assistantPromptUuid: 'prompt-1',
        threadUuid: 'thread-1',
        agentUuid: 'agent-1',
        projectUuid: 'project-1',
        organizationUuid: 'org-1',
    },
    interactionSource: 'app',
    targetTurn: {
        promptUuid: 'prompt-1',
        userPrompt: 'As always, weekly revenue in GBP as a table please',
        assistantResponse: 'Here is the weekly revenue table in GBP.',
        errorMessage: null,
        createdAt: new Date('2026-10-05T10:00:00.000Z'),
        respondedAt: new Date('2026-10-05T10:00:01.000Z'),
    },
    humanFeedback: { score: null, comment: null },
    agentConfig: {
        snapshotHash: null,
        settings: ['skills'],
        availableCapabilities: [],
        dataAccessEnabled: null,
        selfImprovementEnabled: null,
        contentToolsEnabled: null,
        instructionSummary: null,
        knowledgeDocumentCount: 0,
        knowledgeDocuments: [],
        mcpServers: [],
        skills: [
            {
                name: 'weekly-revenue-table',
                description: 'Use when the user asks for weekly revenue.',
            },
        ],
    },
    semanticContext: {
        queriedExploreNames: [],
        queriedFieldNames: [],
        catalogMatches: [],
    },
    nextUserPrompt: null,
    previousTurns: [],
    queryHistory: [],
    supportingEvidence: [],
    suggestedEvidenceExcerpts: [],
    threadWritebackPullRequests: [],
    toolOutcomes: [],
    pendingApprovalTimeout: false,
    existingReviewItems: [],
};

const evidence: SkillProposalAuthoringEvidence = {
    evidencePacket,
    finding: {
        reviewItem: {
            title: 'Users keep asking for the weekly GBP revenue table',
            description: 'Recurring presentation steer.',
        },
        promotionReason: 'Standing instruction repeated across threads.',
        subcategories: ['weekly-revenue-table'],
        recommendation: {
            actionType: 'create_skill',
            title: 'Create a weekly revenue skill',
            rationale: 'The same steer recurs.',
            targetRefs: [],
        },
        evidenceExcerpts: [],
    },
    existingSkills: evidencePacket.agentConfig.skills,
};

const model = getModel(lightdashConfigMock.ai.copilot, {
    useFastModel: true,
});
const telemetry = getAiCallTelemetry({
    functionId: 'skillProposalAuthoringTest',
    feature: 'review-classifier',
    keyManagement: model.keyManagement,
});

const author = (skillProposal: unknown) =>
    authorSkillProposal({
        evidence,
        model,
        telemetry,
        authoringLlmCall: async () => ({ skillProposal }),
    });

describe('authorSkillProposal', () => {
    it('returns the drafted skill when its name is valid and new', async () => {
        const proposal = {
            name: 'monthly-churn-review',
            description: 'Use when the user asks for the monthly churn review.',
            instructions:
                '## When to use\nMonthly churn.\n\n## Steps\n1. Query churn.',
        };

        await expect(author(proposal)).resolves.toEqual(proposal);
    });

    it('drops a draft whose name is already bound to the agent', async () => {
        await expect(
            author({
                name: 'weekly-revenue-table',
                description: 'Duplicate of an existing skill.',
                instructions: '## Steps\n1. Repeat.',
            }),
        ).resolves.toBeNull();
    });

    it('drops a draft whose name is not a valid slash command', async () => {
        await expect(
            author({
                name: 'Weekly Revenue',
                description: 'Spaces and capitals are not allowed.',
                instructions: '## Steps\n1. Repeat.',
            }),
        ).resolves.toBeNull();
    });

    it('drops a draft that uses the reserved name prefix', async () => {
        await expect(
            author({
                name: 'lightdash-weekly',
                description: 'Reserved prefix.',
                instructions: '## Steps\n1. Repeat.',
            }),
        ).resolves.toBeNull();
    });

    it('passes through a null draft', async () => {
        await expect(author(null)).resolves.toBeNull();
    });
});
