import { Ability } from '@casl/ability';
import {
    ContentAsCodeType,
    OrganizationMemberRole,
    type AgentAsCode,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { AiAgentCoderService } from './AiAgentCoderService';

const projectUuid = 'project-uuid';
const organizationUuid = 'organization-uuid';

const buildUser = (ability: Ability<PossibleAbilities>): SessionUser => ({
    userUuid: 'user-uuid',
    email: 'admin@example.com',
    firstName: 'Agent',
    lastName: 'Admin',
    organizationUuid,
    organizationName: 'Test organization',
    organizationCreatedAt: new Date(),
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    avatarUrl: null,
    avatarGradient: null,
    timezone: null,
    isSetupComplete: true,
    userId: 1,
    role: OrganizationMemberRole.ADMIN,
    isActive: true,
    abilityRules: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ability,
});

const user = buildUser(
    new Ability<PossibleAbilities>([
        {
            action: ['view', 'manage'],
            subject: 'ContentAsCode',
            conditions: { projectUuid, organizationUuid },
        },
        {
            action: 'manage',
            subject: 'AiAgent',
            conditions: { projectUuid, organizationUuid },
        },
    ]),
);

const agentRow = {
    uuid: 'agent-uuid',
    slug: 'revenue-agent',
    agentVersion: 2 as const,
    name: 'Revenue agent',
    description: 'Answers revenue questions',
    imageUrl: null,
    instruction: 'Use certified metrics.',
    tags: ['sales', 'certified'],
    enableDataAccess: true,
    enableSelfImprovement: false,
    enableContentTools: true,
    enableUserContext: false,
    enableSqlMode: false,
    modelConfig: null,
    updatedAt: new Date('2026-07-14T08:00:00.000Z'),
};

const agentAsCode: AgentAsCode = {
    contentType: ContentAsCodeType.AI_AGENT,
    version: 1,
    agentVersion: 2,
    slug: 'revenue-agent',
    name: 'Revenue agent',
    description: 'Answers revenue questions',
    imageUrl: null,
    instruction: 'Use certified metrics.',
    tags: ['certified', 'sales'],
    enableDataAccess: true,
    enableSelfImprovement: false,
    enableContentTools: true,
    enableUserContext: false,
    enableSqlMode: false,
    modelConfig: null,
};

const existingEvaluation = {
    agentUuid: 'agent-uuid',
    evalUuid: 'eval-uuid',
    title: 'Core regression suite',
    prompts: [
        {
            prompt: 'What was revenue last month?',
            expectedResponse: 'Uses the certified revenue metric.',
        },
    ],
};

const ownedDocument = {
    uuid: 'document-uuid',
    name: 'Revenue definitions',
    alwaysIncludeInContext: false,
    mimeType: 'text/markdown',
    content: '# Revenue\n\nNet of refunds.',
    contentSizeBytes: 24,
};

const buildService = ({
    existing = [agentRow],
    evaluations = [],
    retentionEnabled = false,
    retentionCeiling = null,
    skillsEnabled = true,
    boundSkills = [],
    skillsByName = {},
    pinnedCredentialUuid = null,
    ownedDocuments = [],
    syncEnabled = false,
    storedDocumentBytes = 0,
}: {
    existing?: (typeof agentRow & { threadRetentionHours?: number | null })[];
    evaluations?: (typeof existingEvaluation)[];
    retentionEnabled?: boolean;
    retentionCeiling?: number | null;
    skillsEnabled?: boolean;
    boundSkills?: { uuid: string; name: string }[];
    pinnedCredentialUuid?: string | null;
    skillsByName?: Record<
        string,
        { uuid: string; name: string; deletedAt: Date | null }
    >;
    ownedDocuments?: (typeof ownedDocument)[];
    syncEnabled?: boolean;
    storedDocumentBytes?: number;
} = {}) => {
    const aiAgentModel = {
        findAgentsForCode: vi.fn(async () => existing),
        findAgentEvalsForCode: vi.fn(async () => evaluations),
        findProviderCredentialUuid: vi.fn(async () => pinnedCredentialUuid),
        updateAgent: vi.fn(async () => undefined),
        createAgent: vi.fn(async () => ({ uuid: 'created-agent-uuid' })),
        createEval: vi.fn(async () => undefined),
        updateEval: vi.fn(async () => undefined),
    };
    const aiAgentSkillModel = {
        findBoundToAgent: vi.fn(async () => boundSkills),
        findByName: vi.fn(
            async ({ name }: { name: string }) => skillsByName[name],
        ),
    };
    const aiAgentSkillService = {
        isEnabled: vi.fn(async () => skillsEnabled),
        setAgentSkills: vi.fn(async () => ({ skills: [], builtInSkills: [] })),
    };
    const aiOrganizationSettingsService = {
        isThreadRetentionEnabled: vi.fn(async () => retentionEnabled),
        getThreadRetentionCeiling: vi.fn(async () => retentionCeiling),
        validateAgentProviderCredential: vi.fn(async () => undefined),
    };
    const aiAgentDocumentModel = {
        findOwnedByAgent: vi.fn(async () => ownedDocuments),
        getOrganizationContentSize: vi.fn(async () => storedDocumentBytes),
    };
    const aiAgentDocumentService = {
        createDocument: vi.fn(async () => ({ uuid: 'created-document-uuid' })),
        updateDocumentContent: vi.fn(async () => undefined),
        updateDocument: vi.fn(async () => undefined),
        deleteDocument: vi.fn(async () => undefined),
    };
    const contentAsCodeSnapshotModel = {
        upsert: vi.fn(async () => undefined),
        delete: vi.fn(async () => undefined),
    };
    const service = new AiAgentCoderService({
        aiAgentModel: aiAgentModel as never,
        aiAgentSkillModel: aiAgentSkillModel as never,
        aiAgentSkillService: aiAgentSkillService as never,
        aiAgentDocumentModel: aiAgentDocumentModel as never,
        aiAgentDocumentService: aiAgentDocumentService as never,
        contentAsCodeProjectSettingsModel: {
            get: vi.fn(async () => ({ syncEnabled })),
        } as never,
        contentAsCodeSnapshotModel: contentAsCodeSnapshotModel as never,
        projectModel: {
            getSummary: vi.fn(async () => ({
                projectUuid,
                organizationUuid,
            })),
        } as never,
        lightdashConfig: lightdashConfigMock,
        aiOrganizationSettingsService: aiOrganizationSettingsService as never,
    });

    return {
        service,
        aiAgentModel,
        aiAgentSkillModel,
        aiAgentSkillService,
        aiOrganizationSettingsService,
        aiAgentDocumentService,
        contentAsCodeSnapshotModel,
    };
};

describe('AiAgentCoderService', () => {
    it('exports project-scoped agent configuration with deterministic tags', async () => {
        const { service, aiAgentModel } = buildService();

        const result = await service.downloadAgents(user, projectUuid, [
            'revenue-agent',
        ]);

        expect(result.agents).toEqual([
            {
                ...agentAsCode,
                skills: [],
                knowledgeDocuments: [],
                evaluations: [],
                updatedAt: agentRow.updatedAt,
            },
        ]);
        expect(result.missingIds).toEqual([]);
        expect(aiAgentModel.findAgentsForCode).toHaveBeenCalledWith({
            organizationUuid,
            projectUuid,
            slugs: ['revenue-agent'],
            agentUuids: undefined,
        });
    });

    it('exports evaluation definitions without runtime history', async () => {
        const { service, aiAgentModel } = buildService({
            evaluations: [existingEvaluation],
        });

        const result = await service.downloadAgents(user, projectUuid, [
            'revenue-agent',
        ]);

        expect(result.agents[0].evaluations).toEqual([
            {
                title: existingEvaluation.title,
                prompts: existingEvaluation.prompts,
            },
        ]);
        expect(aiAgentModel.findAgentEvalsForCode).toHaveBeenCalledWith([
            'agent-uuid',
        ]);
    });

    it('looks up UUID-shaped identifiers as both slugs and UUIDs', async () => {
        const uuidIdentifier = '550e8400-e29b-41d4-a716-446655440000';
        const { service, aiAgentModel } = buildService({ existing: [] });

        await service.downloadAgents(user, projectUuid, [uuidIdentifier]);

        expect(aiAgentModel.findAgentsForCode).toHaveBeenCalledWith({
            organizationUuid,
            projectUuid,
            slugs: [uuidIdentifier],
            agentUuids: [uuidIdentifier],
        });
    });

    it('does not update an unchanged agent', async () => {
        const { service, aiAgentModel } = buildService();

        const result = await service.upsertAgents(user, projectUuid, [
            agentAsCode,
        ]);

        expect(result).toEqual({
            created: [],
            updated: [],
            unchanged: ['revenue-agent'],
            deleted: [],
        });
        expect(aiAgentModel.updateAgent).not.toHaveBeenCalled();
    });

    it('defaults legacy as-code input to SQL enabled', async () => {
        const { service, aiAgentModel } = buildService();
        const legacyAgent = { ...agentAsCode, enableSqlMode: undefined };

        await service.upsertAgents(user, projectUuid, [legacyAgent]);

        expect(aiAgentModel.updateAgent).toHaveBeenCalledWith(
            expect.objectContaining({ enableSqlMode: true }),
        );
    });

    it('upserts declared evaluations by title without deleting undeclared suites', async () => {
        const unrelatedEvaluation = {
            ...existingEvaluation,
            evalUuid: 'unrelated-eval-uuid',
            title: 'UI-managed suite',
        };
        const { service, aiAgentModel } = buildService({
            evaluations: [existingEvaluation, unrelatedEvaluation],
        });
        const updatedPrompts = [
            {
                prompt: 'What was revenue this quarter?',
                expectedResponse: 'Uses the certified revenue metric.',
            },
        ];
        const newPrompts = [
            {
                prompt: 'Which region grew fastest?',
                expectedResponse: null,
            },
        ];

        const result = await service.upsertAgents(user, projectUuid, [
            {
                ...agentAsCode,
                evaluations: [
                    {
                        title: existingEvaluation.title,
                        prompts: updatedPrompts,
                    },
                    {
                        title: 'Regional regression suite',
                        prompts: newPrompts,
                    },
                ],
            },
        ]);

        expect(result.updated).toEqual(['revenue-agent']);
        expect(aiAgentModel.updateAgent).not.toHaveBeenCalled();
        expect(aiAgentModel.updateEval).toHaveBeenCalledWith('eval-uuid', {
            title: existingEvaluation.title,
            prompts: updatedPrompts,
        });
        expect(aiAgentModel.createEval).toHaveBeenCalledWith(
            'agent-uuid',
            {
                title: 'Regional regression suite',
                prompts: newPrompts,
            },
            'user-uuid',
        );
        expect(aiAgentModel.updateEval).not.toHaveBeenCalledWith(
            'unrelated-eval-uuid',
            expect.anything(),
        );
    });

    it('preserves evaluations when the optional field is omitted', async () => {
        const { service, aiAgentModel } = buildService({
            evaluations: [existingEvaluation],
        });

        const result = await service.upsertAgents(user, projectUuid, [
            agentAsCode,
        ]);

        expect(result.unchanged).toEqual(['revenue-agent']);
        expect(aiAgentModel.createEval).not.toHaveBeenCalled();
        expect(aiAgentModel.updateEval).not.toHaveBeenCalled();
    });

    it('does not update an unchanged declared evaluation', async () => {
        const prompts = [
            ...existingEvaluation.prompts,
            {
                prompt: 'Which region grew fastest?',
                expectedResponse: 'Compares regional growth rates.',
            },
        ];
        const { service, aiAgentModel } = buildService({
            evaluations: [{ ...existingEvaluation, prompts }],
        });

        const result = await service.upsertAgents(user, projectUuid, [
            {
                ...agentAsCode,
                evaluations: [
                    {
                        title: existingEvaluation.title,
                        prompts: [...prompts].reverse(),
                    },
                ],
            },
        ]);

        expect(result.unchanged).toEqual(['revenue-agent']);
        expect(aiAgentModel.createEval).not.toHaveBeenCalled();
        expect(aiAgentModel.updateEval).not.toHaveBeenCalled();
    });

    it('rejects duplicate evaluation titles before changing an agent', async () => {
        const { service, aiAgentModel } = buildService();

        await expect(
            service.upsertAgents(user, projectUuid, [
                {
                    ...agentAsCode,
                    evaluations: [
                        {
                            title: 'Duplicate suite',
                            prompts: [],
                        },
                        {
                            title: 'Duplicate suite',
                            prompts: [],
                        },
                    ],
                },
            ]),
        ).rejects.toThrow(
            "Duplicate evaluation titles for AI agent 'revenue-agent': Duplicate suite",
        );
        expect(aiAgentModel.updateAgent).not.toHaveBeenCalled();
        expect(aiAgentModel.createEval).not.toHaveBeenCalled();
        expect(aiAgentModel.updateEval).not.toHaveBeenCalled();
    });

    it('updates the managed project configuration without touching access or integrations', async () => {
        const { service, aiAgentModel } = buildService();

        const result = await service.upsertAgents(user, projectUuid, [
            { ...agentAsCode, name: 'Revenue specialist' },
        ]);

        expect(result.updated).toEqual(['revenue-agent']);
        expect(aiAgentModel.updateAgent).toHaveBeenCalledWith(
            expect.objectContaining({
                agentUuid: 'agent-uuid',
                name: 'Revenue specialist',
                version: 2,
                projectUuid,
                organizationUuid,
            }),
        );
        expect(aiAgentModel.updateAgent).toHaveBeenCalledWith(
            expect.not.objectContaining({
                groupAccess: expect.anything(),
                userAccess: expect.anything(),
                spaceAccess: expect.anything(),
                integrations: expect.anything(),
                mcpServerUuids: expect.anything(),
            }),
        );
        expect(aiAgentModel.updateAgent).toHaveBeenCalledWith(
            expect.not.objectContaining({
                imageUrl: expect.anything(),
                imageUrlSource: expect.anything(),
            }),
        );
    });

    it('updates avatar provenance only when the managed image URL changes', async () => {
        const { service, aiAgentModel } = buildService();

        await service.upsertAgents(user, projectUuid, [
            {
                ...agentAsCode,
                imageUrl: 'https://example.com/avatar.png',
            },
        ]);

        expect(aiAgentModel.updateAgent).toHaveBeenCalledWith(
            expect.objectContaining({
                imageUrl: 'https://example.com/avatar.png',
                imageUrlSource: 'url',
            }),
        );
    });

    it('preserves avatar provenance on a forced update when the URL is unchanged', async () => {
        const { service, aiAgentModel } = buildService();

        await service.upsertAgents(user, projectUuid, [agentAsCode], true);

        expect(aiAgentModel.updateAgent).toHaveBeenCalledWith(
            expect.not.objectContaining({
                imageUrl: expect.anything(),
                imageUrlSource: expect.anything(),
            }),
        );
    });

    it('creates a new agent with its declared slug, agent version, and safe empty access defaults', async () => {
        const { service, aiAgentModel } = buildService({ existing: [] });

        const result = await service.upsertAgents(user, projectUuid, [
            {
                ...agentAsCode,
                agentVersion: 1,
                evaluations: [
                    {
                        title: 'Core regression suite',
                        prompts: existingEvaluation.prompts,
                    },
                ],
            },
        ]);

        expect(result.created).toEqual(['revenue-agent']);
        expect(aiAgentModel.createAgent).toHaveBeenCalledWith(
            expect.objectContaining({
                slug: 'revenue-agent',
                projectUuid,
                organizationUuid,
                integrations: [],
                groupAccess: [],
                userAccess: [],
                spaceAccess: [],
                mcpServerUuids: [],
                version: 1,
            }),
        );
        expect(aiAgentModel.createEval).toHaveBeenCalledWith(
            'created-agent-uuid',
            {
                title: 'Core regression suite',
                prompts: existingEvaluation.prompts,
            },
            'user-uuid',
        );
    });

    it('rejects duplicate slugs before changing agents', async () => {
        const { service, aiAgentModel } = buildService();

        await expect(
            service.upsertAgents(user, projectUuid, [agentAsCode, agentAsCode]),
        ).rejects.toThrow('Duplicate AI agent slugs in upload: revenue-agent');
        expect(aiAgentModel.updateAgent).not.toHaveBeenCalled();
        expect(aiAgentModel.createAgent).not.toHaveBeenCalled();
    });

    it.each([
        {
            agent: { ...agentAsCode, version: 2 },
            error: 'Unsupported AI agent as-code version 2',
        },
        {
            agent: {
                ...agentAsCode,
                enableDataAccess: false,
                enableContentTools: true,
            },
            error: 'must enable data access before enabling content tools',
        },
    ])(
        'rejects invalid agent configuration: $error',
        async ({ agent, error }) => {
            const { service, aiAgentModel } = buildService();

            await expect(
                service.upsertAgents(user, projectUuid, [agent]),
            ).rejects.toThrow(error);
            expect(aiAgentModel.updateAgent).not.toHaveBeenCalled();
            expect(aiAgentModel.createAgent).not.toHaveBeenCalled();
        },
    );

    it('requires both content-as-code and AI-agent permissions', async () => {
        const forbiddenUser = buildUser(
            new Ability<PossibleAbilities>([
                {
                    action: 'manage',
                    subject: 'AiAgent',
                    conditions: { projectUuid, organizationUuid },
                },
            ]),
        );
        const { service } = buildService();

        await expect(
            service.downloadAgents(forbiddenUser, projectUuid),
        ).rejects.toThrow('You are not allowed to download AI agents as code');
        await expect(
            service.upsertAgents(forbiddenUser, projectUuid, [agentAsCode]),
        ).rejects.toThrow('You are not allowed to upload AI agents as code');
    });

    it('warns and ignores a declared retention window when the org flag is off', async () => {
        const { service, aiAgentModel } = buildService({
            retentionEnabled: false,
        });

        const result = await service.upsertAgents(user, projectUuid, [
            { ...agentAsCode, threadRetentionHours: 24 },
        ]);

        expect(result.warnings).toEqual([
            "AI agent 'revenue-agent': threadRetentionHours was ignored — AI thread retention is not enabled for this organization",
        ]);
        // The field is not compared or written, so the agent stays unchanged.
        expect(result.unchanged).toEqual(['revenue-agent']);
        expect(aiAgentModel.updateAgent).not.toHaveBeenCalled();
    });

    it('does not warn when a flag-off upload declares a null retention window', async () => {
        const { service } = buildService({ retentionEnabled: false });

        const result = await service.upsertAgents(user, projectUuid, [
            { ...agentAsCode, threadRetentionHours: null },
        ]);

        expect(result.warnings).toBeUndefined();
        expect(result.unchanged).toEqual(['revenue-agent']);
    });

    it('with the flag off, a stored retention value does not make uploads look changed', async () => {
        const { service, aiAgentModel } = buildService({
            existing: [{ ...agentRow, threadRetentionHours: 24 }],
            retentionEnabled: false,
        });

        const result = await service.upsertAgents(user, projectUuid, [
            agentAsCode,
        ]);

        expect(result.unchanged).toEqual(['revenue-agent']);
        expect(result.warnings).toBeUndefined();
        expect(aiAgentModel.updateAgent).not.toHaveBeenCalled();
    });

    it('rejects a retention window above the org ceiling before changing agents', async () => {
        const { service, aiAgentModel } = buildService({
            retentionEnabled: true,
            retentionCeiling: 24,
        });

        await expect(
            service.upsertAgents(user, projectUuid, [
                { ...agentAsCode, threadRetentionHours: 25 },
            ]),
        ).rejects.toThrow(
            "AI agent 'revenue-agent': thread retention cannot exceed the organization limit of 24 hours",
        );
        expect(aiAgentModel.updateAgent).not.toHaveBeenCalled();
        expect(aiAgentModel.createAgent).not.toHaveBeenCalled();
    });

    it('writes a declared retention window and clears on an explicit null when the flag is on', async () => {
        const { service, aiAgentModel } = buildService({
            existing: [{ ...agentRow, threadRetentionHours: null }],
            retentionEnabled: true,
        });

        const declared = await service.upsertAgents(user, projectUuid, [
            { ...agentAsCode, threadRetentionHours: 24 },
        ]);
        expect(declared.updated).toEqual(['revenue-agent']);
        expect(aiAgentModel.updateAgent).toHaveBeenCalledWith(
            expect.objectContaining({ threadRetentionHours: 24 }),
        );

        const { service: clearingService, aiAgentModel: clearingModel } =
            buildService({
                existing: [{ ...agentRow, threadRetentionHours: 24 }],
                retentionEnabled: true,
            });
        const cleared = await clearingService.upsertAgents(user, projectUuid, [
            { ...agentAsCode, threadRetentionHours: null },
        ]);
        expect(cleared.updated).toEqual(['revenue-agent']);
        expect(clearingModel.updateAgent).toHaveBeenCalledWith(
            expect.objectContaining({ threadRetentionHours: null }),
        );
    });

    it('leaves a stored retention window untouched when the document omits the field', async () => {
        const { service, aiAgentModel } = buildService({
            existing: [{ ...agentRow, threadRetentionHours: 24 }],
            retentionEnabled: true,
        });

        const result = await service.upsertAgents(user, projectUuid, [
            agentAsCode,
        ]);

        expect(result.unchanged).toEqual(['revenue-agent']);
        expect(aiAgentModel.updateAgent).not.toHaveBeenCalled();
    });

    describe('skills', () => {
        const skill = {
            uuid: 'skill-1',
            name: 'weekly-review',
            deletedAt: null,
        };

        it('leaves bindings untouched when the document omits skills', async () => {
            const { service, aiAgentSkillService } = buildService({
                boundSkills: [skill],
            });
            const result = await service.upsertAgents(user, projectUuid, [
                agentAsCode,
            ]);
            expect(aiAgentSkillService.setAgentSkills).not.toHaveBeenCalled();
            expect(result.unchanged).toEqual(['revenue-agent']);
        });

        it('binds a declared list through the skills service', async () => {
            const { service, aiAgentSkillService } = buildService({
                skillsByName: { 'weekly-review': skill },
            });
            const result = await service.upsertAgents(user, projectUuid, [
                { ...agentAsCode, skills: ['weekly-review'] },
            ]);
            expect(
                aiAgentSkillService.setAgentSkills,
            ).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
                projectUuid,
                agentUuid: agentRow.uuid,
                skillUuids: ['skill-1'],
            });
            expect(result.updated).toEqual(['revenue-agent']);
        });

        it('treats an empty list as authoritative and unbinds everything', async () => {
            const { service, aiAgentSkillService } = buildService({
                boundSkills: [skill],
            });
            await service.upsertAgents(user, projectUuid, [
                { ...agentAsCode, skills: [] },
            ]);
            expect(
                aiAgentSkillService.setAgentSkills,
            ).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
                projectUuid,
                agentUuid: agentRow.uuid,
                skillUuids: [],
            });
        });

        it('ignores built-in names with a warning', async () => {
            const { service, aiAgentSkillService } = buildService();
            const result = await service.upsertAgents(user, projectUuid, [
                { ...agentAsCode, skills: ['developing-in-lightdash'] },
            ]);
            expect(result.warnings).toEqual([
                "AI agent 'revenue-agent': skill 'developing-in-lightdash' is built in and always on, so it was ignored",
            ]);
            expect(aiAgentSkillService.setAgentSkills).not.toHaveBeenCalled();
        });

        it('fails only the agent that names a missing or deleted skill', async () => {
            const { service, aiAgentModel } = buildService({
                existing: [],
                skillsByName: {
                    gone: {
                        uuid: 'skill-2',
                        name: 'gone',
                        deletedAt: new Date(),
                    },
                },
            });
            const result = await service.upsertAgents(user, projectUuid, [
                { ...agentAsCode, slug: 'broken', skills: ['gone', 'nope'] },
                { ...agentAsCode, slug: 'fine' },
            ]);
            expect(result.failed).toEqual([
                { slug: 'broken', message: expect.stringContaining('gone') },
            ]);
            expect(result.created).toEqual(['fine']);
            expect(aiAgentModel.createAgent).toHaveBeenCalledTimes(1);
        });

        // A broken pin (flag off, unreadable credential) must not block
        // as-code updates that leave the model alone.
        it('skips pin validation when the uploaded model is unchanged', async () => {
            const { service, aiAgentModel, aiOrganizationSettingsService } =
                buildService({ pinnedCredentialUuid: 'cred-1' });
            aiOrganizationSettingsService.validateAgentProviderCredential.mockRejectedValue(
                new Error('should not be called'),
            );
            const result = await service.upsertAgents(user, projectUuid, [
                { ...agentAsCode, name: 'Renamed agent' },
            ]);
            expect(result.updated).toEqual(['revenue-agent']);
            expect(
                aiOrganizationSettingsService.validateAgentProviderCredential,
            ).not.toHaveBeenCalled();
            expect(aiAgentModel.updateAgent).toHaveBeenCalledTimes(1);
        });

        // The pin itself is not managed as code, but an uploaded model the
        // pinned credential cannot serve must fail that agent's upsert rather
        // than persist and break the agent at its next prompt.
        it('fails an update whose model the pinned credential cannot serve', async () => {
            const { service, aiAgentModel, aiOrganizationSettingsService } =
                buildService({ pinnedCredentialUuid: 'cred-1' });
            aiOrganizationSettingsService.validateAgentProviderCredential.mockRejectedValueOnce(
                new Error(
                    'The model "claude-opus-4-8" is not in the allowed models of the credential "Tokyo"',
                ),
            );
            const result = await service.upsertAgents(user, projectUuid, [
                {
                    ...agentAsCode,
                    modelConfig: {
                        modelName: 'claude-opus-4-8',
                        modelProvider: 'bedrock',
                    },
                },
            ]);
            expect(result.failed).toEqual([
                {
                    slug: 'revenue-agent',
                    message: expect.stringContaining('allowed models'),
                },
            ]);
            expect(aiAgentModel.updateAgent).not.toHaveBeenCalled();
        });

        it('reports a binding the caller may not make without dropping the agent', async () => {
            const { service, aiAgentSkillService } = buildService({
                skillsByName: { 'weekly-review': skill },
            });
            aiAgentSkillService.setAgentSkills.mockRejectedValueOnce(
                new Error('You do not have permission'),
            );
            const result = await service.upsertAgents(user, projectUuid, [
                { ...agentAsCode, skills: ['weekly-review'] },
            ]);
            expect(result.failed).toEqual([
                {
                    slug: 'revenue-agent',
                    message: expect.stringContaining('could not be bound'),
                },
            ]);
        });

        it('warns and ignores the skills list when the flag is off', async () => {
            const { service, aiAgentSkillService } = buildService({
                skillsEnabled: false,
                skillsByName: { 'weekly-review': skill },
            });
            const result = await service.upsertAgents(user, projectUuid, [
                { ...agentAsCode, skills: ['weekly-review'] },
            ]);
            expect(result.warnings).toEqual([
                "AI agent 'revenue-agent': skills were ignored — custom agent skills are not enabled for this organization",
            ]);
            expect(aiAgentSkillService.setAgentSkills).not.toHaveBeenCalled();
        });

        it('omits the skills key from downloads when the flag is off', async () => {
            const { service } = buildService({ skillsEnabled: false });
            const { agents } = await service.downloadAgents(user, projectUuid);
            expect(agents[0]).not.toHaveProperty('skills');
        });
    });

    describe('knowledge documents', () => {
        const scope = { projectUuid, agentUuid: agentRow.uuid };
        const declared = {
            name: ownedDocument.name,
            alwaysIncludeInContext: ownedDocument.alwaysIncludeInContext,
            mimeType: 'text/markdown' as const,
            content: ownedDocument.content,
        };

        it('exports the documents the agent owns with their content and usage mode', async () => {
            const { service } = buildService({
                ownedDocuments: [ownedDocument],
            });
            const { agents } = await service.downloadAgents(user, projectUuid);
            expect(agents[0].knowledgeDocuments).toEqual([declared]);
        });

        it('leaves documents untouched when the field is omitted', async () => {
            const { service, aiAgentDocumentService } = buildService({
                ownedDocuments: [ownedDocument],
            });
            const result = await service.upsertAgents(user, projectUuid, [
                agentAsCode,
            ]);
            expect(
                aiAgentDocumentService.deleteDocument,
            ).not.toHaveBeenCalled();
            expect(result.unchanged).toEqual(['revenue-agent']);
        });

        it('creates a declared document the agent does not have yet', async () => {
            const { service, aiAgentDocumentService } = buildService();
            const result = await service.upsertAgents(user, projectUuid, [
                {
                    ...agentAsCode,
                    knowledgeDocuments: [
                        { ...declared, alwaysIncludeInContext: true },
                    ],
                },
            ]);
            expect(
                aiAgentDocumentService.createDocument,
            ).toHaveBeenCalledExactlyOnceWith(user, scope, {
                name: declared.name,
                originalFilename: `${declared.name}.md`,
                mimeType: 'text/markdown',
                content: declared.content,
            });
            expect(
                aiAgentDocumentService.updateDocument,
            ).toHaveBeenCalledExactlyOnceWith(
                user,
                scope,
                'created-document-uuid',
                { alwaysIncludeInContext: true },
                'repo',
            );
            expect(result.updated).toEqual(['revenue-agent']);
        });

        it('does not rewrite a document whose content and usage mode are unchanged', async () => {
            const { service, aiAgentDocumentService } = buildService({
                ownedDocuments: [ownedDocument],
            });
            const result = await service.upsertAgents(user, projectUuid, [
                { ...agentAsCode, knowledgeDocuments: [declared] },
            ]);
            expect(
                aiAgentDocumentService.updateDocumentContent,
            ).not.toHaveBeenCalled();
            expect(
                aiAgentDocumentService.updateDocument,
            ).not.toHaveBeenCalled();
            expect(result.unchanged).toEqual(['revenue-agent']);
        });

        it('rewrites changed content and toggles the usage mode by name', async () => {
            const { service, aiAgentDocumentService } = buildService({
                ownedDocuments: [ownedDocument],
            });
            const result = await service.upsertAgents(user, projectUuid, [
                {
                    ...agentAsCode,
                    knowledgeDocuments: [
                        {
                            ...declared,
                            content: 'Gross of refunds.',
                            alwaysIncludeInContext: true,
                        },
                    ],
                },
            ]);
            expect(
                aiAgentDocumentService.updateDocumentContent,
            ).toHaveBeenCalledExactlyOnceWith(
                user,
                scope,
                ownedDocument.uuid,
                {
                    name: declared.name,
                    content: 'Gross of refunds.',
                    mimeType: 'text/markdown',
                },
                'repo',
            );
            expect(
                aiAgentDocumentService.updateDocument,
            ).toHaveBeenCalledExactlyOnceWith(
                user,
                scope,
                ownedDocument.uuid,
                { alwaysIncludeInContext: true },
                'repo',
            );
            expect(result.updated).toEqual(['revenue-agent']);
        });

        it('keeps a plain-text document plain and rewrites it when only the type changes', async () => {
            const { service, aiAgentDocumentService } = buildService({
                ownedDocuments: [ownedDocument],
            });
            await service.upsertAgents(user, projectUuid, [
                {
                    ...agentAsCode,
                    knowledgeDocuments: [
                        { ...declared, mimeType: 'text/plain' },
                        {
                            name: 'Notes',
                            alwaysIncludeInContext: false,
                            mimeType: 'text/plain',
                            content: 'plain',
                        },
                    ],
                },
            ]);
            expect(
                aiAgentDocumentService.updateDocumentContent,
            ).toHaveBeenCalledExactlyOnceWith(
                user,
                scope,
                ownedDocument.uuid,
                {
                    name: declared.name,
                    content: declared.content,
                    mimeType: 'text/plain',
                },
                'repo',
            );
            expect(
                aiAgentDocumentService.createDocument,
            ).toHaveBeenCalledExactlyOnceWith(user, scope, {
                name: 'Notes',
                originalFilename: 'Notes.txt',
                mimeType: 'text/plain',
                content: 'plain',
            });
        });

        it('treats an empty list as authoritative and deletes the agent-owned rest', async () => {
            const { service, aiAgentDocumentService } = buildService({
                ownedDocuments: [ownedDocument],
            });
            const result = await service.upsertAgents(user, projectUuid, [
                { ...agentAsCode, knowledgeDocuments: [] },
            ]);
            expect(
                aiAgentDocumentService.deleteDocument,
            ).toHaveBeenCalledExactlyOnceWith(
                user,
                scope,
                ownedDocument.uuid,
                'repo',
            );
            expect(result.updated).toEqual(['revenue-agent']);
        });

        it('rejects duplicate document names before changing agents', async () => {
            const { service, aiAgentModel } = buildService();
            await expect(
                service.upsertAgents(user, projectUuid, [
                    {
                        ...agentAsCode,
                        knowledgeDocuments: [declared, { ...declared }],
                    },
                ]),
            ).rejects.toThrow('Duplicate knowledge document names');
            expect(aiAgentModel.updateAgent).not.toHaveBeenCalled();
        });

        it('rejects an oversized or over-named document before changing agents', async () => {
            const { service, aiAgentModel, aiAgentDocumentService } =
                buildService();
            await expect(
                service.upsertAgents(user, projectUuid, [
                    {
                        ...agentAsCode,
                        knowledgeDocuments: [
                            { ...declared, content: 'x'.repeat(20 * 1024 + 1) },
                        ],
                    },
                ]),
            ).rejects.toThrow('exceeds the 20480 byte limit');
            await expect(
                service.upsertAgents(user, projectUuid, [
                    {
                        ...agentAsCode,
                        knowledgeDocuments: [
                            { ...declared, name: 'n'.repeat(256) },
                        ],
                    },
                ]),
            ).rejects.toThrow('Document name cannot exceed 255 characters');
            expect(aiAgentModel.updateAgent).not.toHaveBeenCalled();
            expect(
                aiAgentDocumentService.createDocument,
            ).not.toHaveBeenCalled();
        });

        it('rejects an upload that would exceed the organization quota before changing agents', async () => {
            const { service, aiAgentModel, aiAgentDocumentService } =
                buildService({
                    ownedDocuments: [ownedDocument],
                    storedDocumentBytes: 5 * 1024 * 1024 - 10,
                });
            // The replaced document frees its 24 bytes; 40 incoming still overflows
            await expect(
                service.upsertAgents(user, projectUuid, [
                    {
                        ...agentAsCode,
                        knowledgeDocuments: [
                            { ...declared, content: 'x'.repeat(40) },
                        ],
                    },
                ]),
            ).rejects.toThrow('exceed the organization quota');
            expect(aiAgentModel.updateAgent).not.toHaveBeenCalled();
            expect(
                aiAgentDocumentService.updateDocumentContent,
            ).not.toHaveBeenCalled();
        });

        it('matches a stored name with stray whitespace to its trimmed repo name', async () => {
            const { service, aiAgentDocumentService } = buildService({
                ownedDocuments: [
                    { ...ownedDocument, name: `${ownedDocument.name}  ` },
                ],
            });
            const result = await service.upsertAgents(user, projectUuid, [
                { ...agentAsCode, knowledgeDocuments: [declared] },
            ]);
            expect(
                aiAgentDocumentService.createDocument,
            ).not.toHaveBeenCalled();
            expect(
                aiAgentDocumentService.deleteDocument,
            ).not.toHaveBeenCalled();
            expect(result.unchanged).toEqual(['revenue-agent']);
        });

        it('fails only the agent whose documents could not be applied', async () => {
            const { service, aiAgentDocumentService } = buildService();
            aiAgentDocumentService.createDocument.mockRejectedValueOnce(
                new Error('Content exceeds the 20480 byte limit.'),
            );
            const result = await service.upsertAgents(user, projectUuid, [
                { ...agentAsCode, knowledgeDocuments: [declared] },
            ]);
            expect(result.failed).toEqual([
                {
                    slug: 'revenue-agent',
                    message: expect.stringContaining(
                        'Content exceeds the 20480 byte limit.',
                    ),
                },
            ]);
            expect(result.updated).toEqual([]);
        });

        it('stamps applied documents as Git-backed only under content_as_code.sync', async () => {
            const stamped = buildService({ syncEnabled: true });
            await stamped.service.upsertAgents(user, projectUuid, [
                { ...agentAsCode, knowledgeDocuments: [declared] },
            ]);
            expect(
                stamped.contentAsCodeSnapshotModel.upsert,
            ).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({
                    projectUuid,
                    contentType: 'ai_agent_knowledge_document',
                    slug: `revenue-agent/${declared.name}`,
                }),
            );

            const copyOnly = buildService({ syncEnabled: false });
            await copyOnly.service.upsertAgents(user, projectUuid, [
                { ...agentAsCode, knowledgeDocuments: [declared] },
            ]);
            expect(
                copyOnly.contentAsCodeSnapshotModel.upsert,
            ).not.toHaveBeenCalled();
        });
    });
});
