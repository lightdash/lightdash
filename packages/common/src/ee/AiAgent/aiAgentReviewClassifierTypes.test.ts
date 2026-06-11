import {
    aiAgentJudgeProjectContextEntrySchema,
    aiAgentReviewClassifierJudgeOutputSchema,
    getAiAgentConfigSnapshotHash,
    getAiAgentReviewItemFingerprint,
    getAiAgentReviewItemFingerprintScope,
    type AiAgentConfigSnapshot,
    type AiAgentReviewItemFingerprintInput,
} from './aiAgentReviewClassifierTypes';

const baseJudgeOutput = {
    signal: 'implicit_correction' as const,
    implicitSignalSources: ['next_user_correction' as const],
    confidence: 'high' as const,
    promotedToFinding: true,
    promotionReason: 'Found a semantic-layer correction.',
    primaryRootCause: 'semantic_layer' as const,
    secondaryRootCauses: [],
    subcategories: [],
    fixTargets: [],
    targetRefs: [],
    agentConfigurationSettings: [],
    ownerType: 'semantic_layer_owner' as const,
    evidenceExcerpts: [],
    recommendation: null,
    reviewItem: { title: 'Fix metric', description: 'why' },
    projectContextEntry: null,
};

const baseInput: AiAgentReviewItemFingerprintInput = {
    organizationUuid: 'org-1',
    projectUuid: 'project-1',
    agentUuid: 'agent-1',
    primaryRootCause: 'semantic_layer',
    subcategories: ['wrong_field_or_domain_term', 'missing_default_filter'],
    fixTargets: ['semantic_yaml_patch'],
    targetRefs: [
        {
            type: 'metric',
            modelName: 'orders',
            metricName: 'total_order_amount',
        },
    ],
    agentConfigurationSettings: [],
    capabilityKey: null,
};

describe('getAiAgentReviewItemFingerprint', () => {
    it('is stable when unordered inputs are reordered', () => {
        const reordered: AiAgentReviewItemFingerprintInput = {
            ...baseInput,
            subcategories: [
                'missing_default_filter',
                'wrong_field_or_domain_term',
            ],
            targetRefs: [...baseInput.targetRefs].reverse(),
        };

        expect(getAiAgentReviewItemFingerprint(reordered)).toEqual(
            getAiAgentReviewItemFingerprint(baseInput),
        );
    });

    it('changes when the actionable semantic target changes', () => {
        const differentTarget: AiAgentReviewItemFingerprintInput = {
            ...baseInput,
            targetRefs: [
                {
                    type: 'metric',
                    modelName: 'orders',
                    metricName: 'completed_order_count',
                },
            ],
        };

        expect(getAiAgentReviewItemFingerprint(differentTarget)).not.toEqual(
            getAiAgentReviewItemFingerprint(baseInput),
        );
    });

    it('scopes agent configuration findings to agent, not project', () => {
        const agentConfigInput: AiAgentReviewItemFingerprintInput = {
            ...baseInput,
            primaryRootCause: 'agent_configuration',
            projectUuid: 'project-a',
            targetRefs: [{ type: 'agent_config', setting: 'data_access' }],
            agentConfigurationSettings: ['data_access'],
        };

        expect(
            getAiAgentReviewItemFingerprint({
                ...agentConfigInput,
                projectUuid: 'project-b',
            }),
        ).toEqual(getAiAgentReviewItemFingerprint(agentConfigInput));
    });

    it('requires project scope for semantic layer findings', () => {
        expect(() =>
            getAiAgentReviewItemFingerprintScope({
                organizationUuid: 'org-1',
                projectUuid: null,
                agentUuid: 'agent-1',
                primaryRootCause: 'semantic_layer',
            }),
        ).toThrow('projectUuid is required for semantic_layer fingerprints');
    });
});

describe('aiAgentJudgeProjectContextEntrySchema', () => {
    test('accepts a create entry', () => {
        const result = aiAgentJudgeProjectContextEntrySchema.safeParse({
            op: 'create',
            id: null,
            kind: 'definition',
            content: '"HR" = the high-risk diabetes cohort.',
            terms: ['HR'],
            objects: [],
        });
        expect(result.success).toBe(true);
    });

    test('accepts an update entry referencing an existing id', () => {
        const result = aiAgentJudgeProjectContextEntrySchema.safeParse({
            op: 'update',
            id: 'hr-abbreviation',
            kind: 'definition',
            content: 'updated definition',
            terms: ['HR'],
            objects: ['patient_health_scores'],
        });
        expect(result.success).toBe(true);
    });

    test('rejects an update entry without an id', () => {
        const result = aiAgentJudgeProjectContextEntrySchema.safeParse({
            op: 'update',
            id: null,
            kind: 'definition',
            content: 'updated definition',
            terms: ['HR'],
            objects: [],
        });
        expect(result.success).toBe(false);
    });

    test('rejects an unknown kind', () => {
        const result = aiAgentJudgeProjectContextEntrySchema.safeParse({
            op: 'create',
            id: null,
            kind: 'nonsense',
            content: 'x',
            terms: [],
            objects: [],
        });
        expect(result.success).toBe(false);
    });
});

describe('aiAgentReviewClassifierJudgeOutputSchema', () => {
    it('accepts a promoted finding with an actionable root cause', () => {
        expect(
            aiAgentReviewClassifierJudgeOutputSchema.safeParse(baseJudgeOutput)
                .success,
        ).toBe(true);
    });

    it('rejects a promoted finding with primaryRootCause not_a_failure', () => {
        const result = aiAgentReviewClassifierJudgeOutputSchema.safeParse({
            ...baseJudgeOutput,
            promotedToFinding: true,
            primaryRootCause: 'not_a_failure',
        });
        expect(result.success).toBe(false);
    });

    it('accepts not_a_failure when not promoted', () => {
        expect(
            aiAgentReviewClassifierJudgeOutputSchema.safeParse({
                ...baseJudgeOutput,
                promotedToFinding: false,
                primaryRootCause: 'not_a_failure',
            }).success,
        ).toBe(true);
    });
});

describe('getAiAgentConfigSnapshotHash', () => {
    const baseSnapshot: AiAgentConfigSnapshot = {
        capturedAt: '2026-05-26T10:00:00.000Z',
        agentUpdatedAt: '2026-05-26T09:00:00.000Z',
        settings: ['instructions', 'knowledge_documents'],
        availableCapabilities: ['semantic_query', 'chart_generation'],
        instructionHash: 'instruction-hash',
        instructionSummary: 'Use finance definitions.',
        knowledgeDocuments: [
            {
                uuid: 'doc-1',
                name: 'Revenue definitions',
                updatedAt: '2026-05-25T10:00:00.000Z',
                summary: {
                    description: 'Revenue definitions',
                    definedTerms: ['revenue', 'arr'],
                    relatedExploreNames: ['orders'],
                    useWhen: 'Revenue questions',
                    relevance: 'high',
                    warning: null,
                },
            },
        ],
    };

    it('is stable when unordered snapshot arrays are reordered', () => {
        expect(
            getAiAgentConfigSnapshotHash({
                ...baseSnapshot,
                settings: [...baseSnapshot.settings].reverse(),
                availableCapabilities: [
                    ...baseSnapshot.availableCapabilities,
                ].reverse(),
            }),
        ).toEqual(getAiAgentConfigSnapshotHash(baseSnapshot));
    });

    it('changes when instruction content hash changes', () => {
        expect(
            getAiAgentConfigSnapshotHash({
                ...baseSnapshot,
                instructionHash: 'different-instruction-hash',
            }),
        ).not.toEqual(getAiAgentConfigSnapshotHash(baseSnapshot));
    });
});
