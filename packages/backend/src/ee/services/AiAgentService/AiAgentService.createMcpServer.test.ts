import type { ApiCreateAiMcpServer, SessionUser } from '@lightdash/common';
import { AiAgentService } from './AiAgentService';

vi.mock('node:dns/promises', () => ({
    lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]),
}));

type PrivateService = {
    assertCanManageMcpServers: () => Promise<void>;
    assertMcpServersNotInTraining: () => Promise<void>;
};

const buildService = () => {
    const createMcpServer = vi.fn().mockImplementation(async (args) => ({
        uuid: 'server-uuid',
        name: args.name,
    }));
    const service = new AiAgentService({
        aiAgentModel: { createMcpServer },
        lightdashConfig: {
            ai: { copilot: { mcpAllowPrivateAddresses: false } },
        },
    } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
    const privateService = service as unknown as PrivateService;
    vi.spyOn(privateService, 'assertCanManageMcpServers').mockResolvedValue();
    vi.spyOn(
        privateService,
        'assertMcpServersNotInTraining',
    ).mockResolvedValue();

    return { service, createMcpServer };
};

const user = { userUuid: 'user-uuid' } as SessionUser;

const oauthBody = (
    credentials: ApiCreateAiMcpServer['credentials'],
): ApiCreateAiMcpServer => ({
    name: 'Example MCP',
    url: 'https://mcp.example.com/mcp',
    authType: 'oauth',
    credentials,
});

describe('AiAgentService.createMcpServer OAuth client credentials', () => {
    it('stores a client ID without a secret as a public client', async () => {
        const { service, createMcpServer } = buildService();

        await service.createMcpServer(
            user,
            'project-uuid',
            oauthBody({ clientId: ' public-client ', clientSecret: '' }),
        );

        expect(createMcpServer).toHaveBeenCalledWith(
            expect.objectContaining({
                authType: 'oauth',
                credentials: { clientId: 'public-client' },
            }),
        );
    });

    it('stores a client ID with its secret', async () => {
        const { service, createMcpServer } = buildService();

        await service.createMcpServer(
            user,
            'project-uuid',
            oauthBody({ clientId: 'client', clientSecret: ' secret ' }),
        );

        expect(createMcpServer).toHaveBeenCalledWith(
            expect.objectContaining({
                credentials: { clientId: 'client', clientSecret: 'secret' },
            }),
        );
    });

    it('stores no client credentials when both fields are blank', async () => {
        const { service, createMcpServer } = buildService();

        await service.createMcpServer(
            user,
            'project-uuid',
            oauthBody({ clientId: '', clientSecret: '' }),
        );

        expect(createMcpServer).toHaveBeenCalledWith(
            expect.objectContaining({ credentials: null }),
        );
    });

    it('rejects a secret without a client ID', async () => {
        const { service, createMcpServer } = buildService();

        await expect(
            service.createMcpServer(
                user,
                'project-uuid',
                oauthBody({ clientSecret: 'secret' }),
            ),
        ).rejects.toThrow('OAuth client secret requires a client ID');
        expect(createMcpServer).not.toHaveBeenCalled();
    });

    it('rejects client credentials when credential sharing is enabled', async () => {
        const { service, createMcpServer } = buildService();

        await expect(
            service.createMcpServer(user, 'project-uuid', {
                ...oauthBody({ clientId: 'client' }),
                allowOAuthCredentialSharing: true,
            }),
        ).rejects.toThrow('only supported for personal OAuth');
        expect(createMcpServer).not.toHaveBeenCalled();
    });
});
