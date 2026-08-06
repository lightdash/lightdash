import type { ProjectContextEntry } from '@lightdash/common';
import type { AiAgentReviewJudgeEvidencePacket } from '../../AiAgentReviewClassifierService';
import {
    authorProjectContextEntry,
    type ProjectContextEntryAuthoringEvidence,
} from './authorProjectContextEntry';

const currentEntries: ProjectContextEntry[] = [
    {
        id: 'active-users',
        kind: 'definition',
        content: 'Active users signed in during the last 28 days.',
        terms: ['active user'],
        objects: [],
    },
];

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
        userPrompt: 'What is an active user?',
        assistantResponse: 'An active user signed in during the last 28 days.',
        errorMessage: null,
        createdAt: new Date('2026-08-05T10:00:00.000Z'),
        respondedAt: new Date('2026-08-05T10:00:01.000Z'),
    },
    humanFeedback: { score: null, comment: null },
    agentConfig: {
        snapshotHash: null,
        settings: [],
        availableCapabilities: [],
        dataAccessEnabled: null,
        selfImprovementEnabled: null,
        contentToolsEnabled: null,
        instructionSummary: null,
        knowledgeDocumentCount: 0,
        knowledgeDocuments: [],
        mcpServers: [],
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

const evidence = {
    type: 'turn',
    evidencePacket,
    finding: {
        reviewItem: { title: 'Clarify active users', description: 'Ambiguous' },
        promotionReason: 'The answer used the wrong definition.',
        targetRefs: [],
        subcategories: [],
        recommendation: null,
    },
} satisfies ProjectContextEntryAuthoringEvidence;

const authoringResult = {
    projectContextEntry: {
        op: 'update' as const,
        id: 'active-users',
        kind: 'definition' as const,
        content: 'Active users signed in during the last 30 days.',
        terms: ['active user'],
        objects: [],
    },
};

describe('authorProjectContextEntry', () => {
    it('authors from turn evidence and current project-context entries', async () => {
        const authoringLlmCall = vi.fn().mockResolvedValue(authoringResult);

        const result = await authorProjectContextEntry({
            evidence,
            currentEntries,
            model: {} as never,
            telemetry: {} as never,
            authoringLlmCall,
        });

        expect(result).toEqual(authoringResult.projectContextEntry);
        expect(authoringLlmCall).toHaveBeenCalledOnce();
        const userMessage = authoringLlmCall.mock.calls[0][0].messages[1];
        expect(JSON.parse(userMessage.content)).toMatchObject({
            evidencePacket: {
                subject: evidencePacket.subject,
                targetTurn: {
                    promptUuid: 'prompt-1',
                    createdAt: '2026-08-05T10:00:00.000Z',
                    respondedAt: '2026-08-05T10:00:01.000Z',
                },
            },
            finding: evidence.finding,
            currentProjectContextEntries: currentEntries,
        });
    });

    it('validates injected call output', async () => {
        const authoringLlmCall = vi.fn().mockResolvedValue({
            projectContextEntry: {
                ...authoringResult.projectContextEntry,
                id: null,
            },
        });

        await expect(
            authorProjectContextEntry({
                evidence,
                currentEntries,
                model: {} as never,
                telemetry: {} as never,
                authoringLlmCall,
            }),
        ).rejects.toThrow('id is required when op is update');
    });
});
