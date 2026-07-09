import { ParameterError, type SessionUser } from '@lightdash/common';
import { AiAgentService } from './AiAgentService';

vi.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: vi
        .fn()
        // eslint-disable-next-line prefer-arrow-callback
        .mockImplementation(function MockAiAgentMcpRuntimeClient() {
            return {};
        }),
}));

const ORGANIZATION_UUID = 'org-uuid';
const PROJECT_UUID = 'project-uuid';
const USER_UUID = 'user-uuid';
const SERVER_UUID = 'server-uuid';

const user = {
    userUuid: USER_UUID,
    organizationUuid: ORGANIZATION_UUID,
    organizationName: 'Org',
} as unknown as SessionUser;

const bearerServer = {
    uuid: SERVER_UUID,
    projectUuid: PROJECT_UUID,
    name: 'GITHUB test',
    url: 'https://api.githubcopilot.com/mcp/',
    iconUrl: null,
    authType: 'bearer' as const,
    allowOAuthCredentialSharing: false,
    hasCredentials: true,
    credentialScope: 'shared' as const,
    connectionStatus: 'connected' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
};

const buildService = (overrides?: {
    discoverImpl?: () => Promise<unknown>;
    testConnectionImpl?: () => Promise<{ iconUrl: string | null }>;
    getMcpServer?: unknown;
}) => {
    const aiAgentModel = {
        getMcpServer: vi
            .fn()
            .mockResolvedValue(overrides?.getMcpServer ?? bearerServer),
        updateMcpServerRuntimeState: vi.fn().mockResolvedValue(undefined),
        upsertCredential: vi.fn().mockResolvedValue({}),
        upsertDiscoveredMcpServerTools: vi.fn().mockResolvedValue([]),
        resolveCredential: vi.fn().mockResolvedValue(null),
        getCredential: vi.fn().mockResolvedValue(null),
    };
    const aiAgentMcpRuntimeClient = {
        testConnection:
            overrides?.testConnectionImpl ??
            vi.fn().mockResolvedValue({ iconUrl: null }),
        listTools: vi.fn().mockResolvedValue([]),
    };
    const featureFlagService = {
        get: vi.fn().mockResolvedValue({ enabled: true }),
    };
    const service = new AiAgentService({
        aiAgentModel,
        featureFlagService,
        analytics: { track: vi.fn() },
        lightdashConfig: { ai: { copilot: {} } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    // The runtime client is constructed internally; replace it with the mock.
    (
        service as unknown as { aiAgentMcpRuntimeClient: unknown }
    ).aiAgentMcpRuntimeClient = aiAgentMcpRuntimeClient;
    // Match the EE test-suite pattern for bypassing the ability layer.
    (
        service as unknown as { createAuditedAbility: () => unknown }
    ).createAuditedAbility = () => ({ cannot: () => false, can: () => true });
    // discoverMcpServerTools is private; override it for these unit tests.
    (
        service as unknown as { discoverMcpServerTools: () => Promise<unknown> }
    ).discoverMcpServerTools =
        overrides?.discoverImpl ?? vi.fn().mockResolvedValue([]);
    return { service, aiAgentModel, aiAgentMcpRuntimeClient };
};

describe('refreshMcpServerTools status persistence', () => {
    it('marks the server connected when discovery succeeds', async () => {
        const { service, aiAgentModel } = buildService({
            discoverImpl: vi.fn().mockResolvedValue([]),
        });

        await service.refreshMcpServerTools(user, PROJECT_UUID, SERVER_UUID);

        expect(aiAgentModel.updateMcpServerRuntimeState).toHaveBeenCalledWith(
            expect.objectContaining({
                serverUuid: SERVER_UUID,
                connectionStatus: 'connected',
                error: null,
            }),
        );
    });

    it('marks the server errored when discovery fails, then throws', async () => {
        const { service, aiAgentModel } = buildService({
            discoverImpl: vi
                .fn()
                .mockRejectedValue(new Error('HTTP 401 unauthorized')),
        });

        await expect(
            service.refreshMcpServerTools(user, PROJECT_UUID, SERVER_UUID),
        ).rejects.toBeInstanceOf(ParameterError);

        expect(aiAgentModel.updateMcpServerRuntimeState).toHaveBeenCalledWith(
            expect.objectContaining({
                serverUuid: SERVER_UUID,
                connectionStatus: 'error',
            }),
        );
    });
});

describe('updateMcpServerBearerCredential', () => {
    it('validates then saves the new token and marks connected', async () => {
        const testConnection = vi
            .fn()
            .mockResolvedValue({ iconUrl: 'https://x/icon.png' });
        const { service, aiAgentModel } = buildService({
            testConnectionImpl: testConnection,
        });

        const result = await service.updateMcpServerBearerCredential(
            user,
            PROJECT_UUID,
            SERVER_UUID,
            { bearerToken: '  new-token  ' },
        );

        expect(testConnection).toHaveBeenCalledWith(
            expect.objectContaining({
                url: bearerServer.url,
                authType: 'bearer',
                bearerToken: 'new-token',
            }),
        );
        expect(aiAgentModel.upsertCredential).toHaveBeenCalledWith(
            expect.objectContaining({
                serverUuid: SERVER_UUID,
                scope: 'shared',
                credentials: { type: 'bearer', bearerToken: 'new-token' },
            }),
        );
        expect(aiAgentModel.updateMcpServerRuntimeState).toHaveBeenCalledWith(
            expect.objectContaining({
                serverUuid: SERVER_UUID,
                connectionStatus: 'connected',
                error: null,
            }),
        );
        expect(result.uuid).toBe(SERVER_UUID);
    });

    it('rejects a bad token and does NOT save it', async () => {
        const { service, aiAgentModel } = buildService({
            testConnectionImpl: vi
                .fn()
                .mockRejectedValue(new Error('HTTP 401 unauthorized')),
        });

        await expect(
            service.updateMcpServerBearerCredential(
                user,
                PROJECT_UUID,
                SERVER_UUID,
                { bearerToken: 'bad-token' },
            ),
        ).rejects.toBeInstanceOf(ParameterError);

        expect(aiAgentModel.upsertCredential).not.toHaveBeenCalled();
    });

    it('rejects an empty token', async () => {
        const { service, aiAgentModel } = buildService();

        await expect(
            service.updateMcpServerBearerCredential(
                user,
                PROJECT_UUID,
                SERVER_UUID,
                { bearerToken: '   ' },
            ),
        ).rejects.toBeInstanceOf(ParameterError);

        expect(aiAgentModel.upsertCredential).not.toHaveBeenCalled();
    });

    it('rejects a non-bearer server', async () => {
        const { service, aiAgentModel } = buildService({
            getMcpServer: { ...bearerServer, authType: 'oauth' },
        });

        await expect(
            service.updateMcpServerBearerCredential(
                user,
                PROJECT_UUID,
                SERVER_UUID,
                { bearerToken: 'x' },
            ),
        ).rejects.toBeInstanceOf(ParameterError);

        expect(aiAgentModel.upsertCredential).not.toHaveBeenCalled();
    });
});
