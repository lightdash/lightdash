import { AnyType } from '@lightdash/common';
import {
    ManagedAgentClient,
    type ManagedAgentSessionConfig,
} from './ManagedAgentClient';

const PROJECT_UUID = 'd15384cb-8326-433a-a9e9-6f6bb22718f6';
const SITE_URL = 'https://lightdash.example.com';

const anthropic = vi.hoisted(() => ({
    beta: {
        agents: {
            create: vi.fn(),
            retrieve: vi.fn(),
            update: vi.fn(),
        },
        environments: {
            create: vi.fn(),
            list: vi.fn(),
        },
        vaults: {
            create: vi.fn(),
            credentials: {
                create: vi.fn(),
            },
        },
    },
}));

vi.mock('@anthropic-ai/sdk', () => ({
    default: class MockAnthropic {
        beta = anthropic.beta;
    },
}));

const createClient = () =>
    new ManagedAgentClient({
        lightdashConfig: {
            siteUrl: SITE_URL,
            managedAgent: { anthropicApiKey: 'anthropic-api-key' },
        },
    } as AnyType);

const createSessionConfig = (
    overrides: Partial<ManagedAgentSessionConfig> = {},
): ManagedAgentSessionConfig => ({
    projectUuid: PROJECT_UUID,
    serviceAccountPat: 'service-account-token',
    resourceName: 'Organization:org:project',
    skillIds: [],
    toolSettings: {},
    persistedAgentId: 'agent-id',
    persistedAgentConfigHash: 'legacy-config-hash',
    persistedAgentVersion: 1,
    persistedEnvironmentId: 'old-environment-id',
    persistedVaultId: 'old-vault-id',
    persistedVaultConfigHash: null,
    onAgentSynced: vi.fn().mockResolvedValue(undefined),
    onResourcesCreated: vi.fn().mockResolvedValue(undefined),
    ...overrides,
});

describe('ManagedAgentClient.syncAgent', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        anthropic.beta.agents.retrieve.mockResolvedValue({
            id: 'agent-id',
            version: 1,
        });
        anthropic.beta.agents.update.mockResolvedValue({
            id: 'agent-id',
            version: 2,
        });
        anthropic.beta.environments.list.mockResolvedValue({
            data: [
                { id: 'environment-id', name: 'Env Organization:org:project' },
            ],
        });
        anthropic.beta.vaults.create.mockResolvedValue({ id: 'new-vault-id' });
        anthropic.beta.vaults.credentials.create.mockResolvedValue({});
    });

    it('refreshes the vault with the project-specific MCP URL when agent config changes', async () => {
        const onAgentSynced = vi.fn().mockResolvedValue(undefined);
        const onResourcesCreated = vi.fn().mockResolvedValue(undefined);
        const client = createClient();

        await client.syncAgent(
            createSessionConfig({
                onAgentSynced,
                onResourcesCreated,
            }),
        );

        expect(anthropic.beta.vaults.create).toHaveBeenCalledOnce();
        expect(anthropic.beta.vaults.credentials.create).toHaveBeenCalledWith(
            'new-vault-id',
            expect.objectContaining({
                auth: {
                    type: 'static_bearer',
                    mcp_server_url: `${SITE_URL}/api/v1/mcp/projects/${PROJECT_UUID}`,
                    token: 'service-account-token',
                },
            }),
        );
        expect(onResourcesCreated).toHaveBeenCalledWith(
            'environment-id',
            'new-vault-id',
            expect.any(String),
        );
    });

    it('reuses a vault whose persisted credential hash is current', async () => {
        const client = createClient();
        const onAgentSynced = vi.fn().mockResolvedValue(undefined);
        const onResourcesCreated = vi.fn().mockResolvedValue(undefined);
        await client.syncAgent(
            createSessionConfig({ onAgentSynced, onResourcesCreated }),
        );
        const agentConfigHash = onAgentSynced.mock.calls[0][1];
        const vaultConfigHash = onResourcesCreated.mock.calls[0][2];

        await client.syncAgent(
            createSessionConfig({
                persistedAgentConfigHash: agentConfigHash,
                persistedAgentVersion: 2,
                persistedEnvironmentId: 'environment-id',
                persistedVaultId: 'new-vault-id',
                persistedVaultConfigHash: vaultConfigHash,
                onAgentSynced,
                onResourcesCreated,
            }),
        );

        expect(anthropic.beta.vaults.create).toHaveBeenCalledTimes(1);
        expect(onResourcesCreated).toHaveBeenCalledTimes(1);
    });

    it('retries vault creation when resource persistence fails', async () => {
        anthropic.beta.vaults.create
            .mockResolvedValueOnce({ id: 'first-vault-id' })
            .mockResolvedValueOnce({ id: 'retry-vault-id' });
        const client = createClient();
        const onAgentSynced = vi.fn().mockResolvedValue(undefined);
        const onResourcesCreated = vi
            .fn()
            .mockRejectedValueOnce(new Error('database unavailable'))
            .mockResolvedValueOnce(undefined);
        const sessionConfig = createSessionConfig({
            onAgentSynced,
            onResourcesCreated,
        });

        await expect(client.syncAgent(sessionConfig)).rejects.toThrow(
            'database unavailable',
        );
        await client.syncAgent({
            ...sessionConfig,
            persistedAgentConfigHash: onAgentSynced.mock.calls[0][1],
            persistedAgentVersion: 2,
        });

        expect(anthropic.beta.vaults.create).toHaveBeenCalledTimes(2);
        expect(onResourcesCreated).toHaveBeenLastCalledWith(
            'environment-id',
            'retry-vault-id',
            expect.any(String),
        );
    });
});
