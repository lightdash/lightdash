import { ForbiddenError, type SessionUser } from '@lightdash/common';
import { DatabaseError } from 'pg';
import type { AiAgentModel } from '../../models/AiAgentModel';
import { AiAgentService } from './AiAgentService';

vi.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: vi
        .fn()
        // eslint-disable-next-line prefer-arrow-callback
        .mockImplementation(function MockAiAgentMcpRuntimeClient() {
            return {};
        }),
}));

const ORGANIZATION_UUID = 'organization-uuid';
const PROJECT_UUID = 'project-uuid';

const user = {
    userUuid: 'user-uuid',
    organizationUuid: ORGANIZATION_UUID,
} as unknown as SessionUser;

const createUniqueViolation = (): DatabaseError => {
    const error = new DatabaseError('duplicate agent', 0, 'error');
    error.code = '23505';
    return error;
};

const buildService = () => {
    const findAllAgents = vi.fn<AiAgentModel['findAllAgents']>();
    const service = new AiAgentService({
        aiAgentModel: { findAllAgents },
    } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
    const getIsCopilotEnabled = vi.spyOn(service, 'getIsCopilotEnabled');
    const createAgent = vi.spyOn(service, 'createAgent');

    return {
        service,
        findAllAgents: vi.mocked(findAllAgents),
        getIsCopilotEnabled: vi.mocked(getIsCopilotEnabled),
        createAgent: vi.mocked(createAgent),
    };
};

describe('AiAgentService.provisionDefaultAgent', () => {
    it('does not create an agent when copilot is disabled', async () => {
        const { service, findAllAgents, getIsCopilotEnabled, createAgent } =
            buildService();
        getIsCopilotEnabled.mockResolvedValue(false);

        await service.provisionDefaultAgent(user, PROJECT_UUID);

        expect(findAllAgents).not.toHaveBeenCalled();
        expect(createAgent).not.toHaveBeenCalled();
    });

    it('does not create an agent when the project already has one', async () => {
        const { service, findAllAgents, getIsCopilotEnabled, createAgent } =
            buildService();
        getIsCopilotEnabled.mockResolvedValue(true);
        findAllAgents.mockResolvedValue([{}] as Awaited<
            ReturnType<AiAgentModel['findAllAgents']>
        >);

        await service.provisionDefaultAgent(user, PROJECT_UUID);

        expect(findAllAgents).toHaveBeenCalledWith({
            organizationUuid: ORGANIZATION_UUID,
            filter: { projectFilter: { projectUuid: PROJECT_UUID } },
        });
        expect(createAgent).not.toHaveBeenCalled();
    });

    it('creates Aurora with the starter configuration', async () => {
        const { service, findAllAgents, getIsCopilotEnabled, createAgent } =
            buildService();
        getIsCopilotEnabled.mockResolvedValue(true);
        findAllAgents.mockResolvedValue([]);
        createAgent.mockResolvedValue(
            {} as Awaited<ReturnType<AiAgentService['createAgent']>>,
        );

        await service.provisionDefaultAgent(user, PROJECT_UUID);

        expect(createAgent).toHaveBeenCalledWith(
            user,
            {
                name: 'Aurora',
                projectUuid: PROJECT_UUID,
                description: null,
                integrations: [],
                tags: null,
                instruction:
                    "You are Aurora, this organization's analytics agent. Help people explore and understand their data, and answer questions with clear, concise analysis. If no explores are available yet, use your warehouse tools to discover the schema and answer with SQL.",
                imageUrl: null,
                groupAccess: [],
                userAccess: [],
                spaceAccess: [],
                enableDataAccess: true,
                enableSelfImprovement: false,
                version: 2,
            },
            { autoProvisioned: true },
        );
    });

    it.each([
        ['a forbidden error', new ForbiddenError()],
        ['a unique constraint violation', createUniqueViolation()],
        ['an unexpected error', new Error('create failed')],
    ])('does not propagate %s from createAgent', async (_name, error) => {
        const { service, findAllAgents, getIsCopilotEnabled, createAgent } =
            buildService();
        getIsCopilotEnabled.mockResolvedValue(true);
        findAllAgents.mockResolvedValue([]);
        createAgent.mockRejectedValue(error);

        await expect(
            service.provisionDefaultAgent(user, PROJECT_UUID),
        ).resolves.toBeUndefined();
    });
});
