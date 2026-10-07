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
    recentSimilarPrompts: {
        windowDays: 30,
        threadCount: 0,
        userCount: 0,
        prompts: [],
    },
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
            arguments: [],
            argumentHint: null,
        };

        await expect(author(proposal)).resolves.toEqual(proposal);
    });

    it('drops a draft whose name is already bound to the agent', async () => {
        await expect(
            author({
                name: 'weekly-revenue-table',
                description: 'Duplicate of an existing skill.',
                instructions: '## Steps\n1. Repeat.',
                arguments: [],
                argumentHint: null,
            }),
        ).resolves.toBeNull();
    });

    it('drops a draft whose name is not a valid slash command', async () => {
        await expect(
            author({
                name: 'Weekly Revenue',
                description: 'Spaces and capitals are not allowed.',
                instructions: '## Steps\n1. Repeat.',
                arguments: [],
                argumentHint: null,
            }),
        ).resolves.toBeNull();
    });

    it('drops a draft that uses the reserved name prefix', async () => {
        await expect(
            author({
                name: 'lightdash-weekly',
                description: 'Reserved prefix.',
                instructions: '## Steps\n1. Repeat.',
                arguments: [],
                argumentHint: null,
            }),
        ).resolves.toBeNull();
    });

    it('declares every named placeholder the draft uses, in lowercase', async () => {
        const result = await author({
            name: 'weekly-sales-review',
            description: 'Use when the user asks for the weekly sales review.',
            instructions:
                '## Steps\n1. Query the period given as $PERIOD for $Region.\n2. Keep $ARGUMENTS out of it.',
            arguments: ['period'],
            argumentHint: null,
        });

        expect(result?.arguments).toEqual(['period', 'region']);
        expect(result?.argumentHint).toBe('<period> <region>');
        expect(result?.instructions).toContain('$period for $region');
        expect(result?.instructions).toContain('$ARGUMENTS');
    });

    it('leaves a free-text draft on $ARGUMENTS with no named arguments', async () => {
        const result = await author({
            name: 'churn-digest',
            description: 'Use when the user asks for a churn digest.',
            instructions: '## Steps\n1. Summarise churn for $ARGUMENTS.',
            arguments: [],
            argumentHint: null,
        });

        expect(result?.arguments).toEqual([]);
        expect(result?.argumentHint).toBeNull();
    });

    it('passes through a null draft', async () => {
        await expect(author(null)).resolves.toBeNull();
    });
});
