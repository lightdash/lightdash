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
    modelConfig: null,
};

const buildService = ({ existing = [agentRow] } = {}) => {
    const aiAgentModel = {
        findAgentsForCode: vi.fn(async () => existing),
        updateAgent: vi.fn(async () => undefined),
        createAgent: vi.fn(async () => undefined),
    };
    const service = new AiAgentCoderService({
        aiAgentModel: aiAgentModel as never,
        projectModel: {
            getSummary: vi.fn(async () => ({
                projectUuid,
                organizationUuid,
            })),
        } as never,
        lightdashConfig: lightdashConfigMock,
    });

    return { service, aiAgentModel };
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
            { ...agentAsCode, agentVersion: 1 },
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
});
