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

const buildService = ({
    existing = [agentRow],
    evaluations = [],
    retentionEnabled = false,
    retentionCeiling = null,
    skillsEnabled = true,
    boundSkills = [],
    skillsByName = {},
}: {
    existing?: (typeof agentRow & { threadRetentionHours?: number | null })[];
    evaluations?: (typeof existingEvaluation)[];
    retentionEnabled?: boolean;
    retentionCeiling?: number | null;
    skillsEnabled?: boolean;
    boundSkills?: { uuid: string; name: string }[];
    skillsByName?: Record<
        string,
        { uuid: string; name: string; deletedAt: Date | null }
    >;
} = {}) => {
    const aiAgentModel = {
        findAgentsForCode: vi.fn(async () => existing),
        findAgentEvalsForCode: vi.fn(async () => evaluations),
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
    const service = new AiAgentCoderService({
        aiAgentModel: aiAgentModel as never,
        aiAgentSkillModel: aiAgentSkillModel as never,
        aiAgentSkillService: aiAgentSkillService as never,
        projectModel: {
            getSummary: vi.fn(async () => ({
                projectUuid,
                organizationUuid,
            })),
        } as never,
        lightdashConfig: lightdashConfigMock,
        aiOrganizationSettingsService: {
            isThreadRetentionEnabled: vi.fn(async () => retentionEnabled),
            getThreadRetentionCeiling: vi.fn(async () => retentionCeiling),
        } as never,
    });

    return { service, aiAgentModel, aiAgentSkillModel, aiAgentSkillService };
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
});
