import { getManagedAgentMcpUrl, renderManagedAgentConfig } from './agent';

const LIGHTDASH_SITE_URL = 'https://lightdash.example.com';
const PROJECT_UUID = 'd15384cb-8326-433a-a9e9-6f6bb22718f6';

describe('renderManagedAgentConfig', () => {
    it('binds the managed agent to its project-specific MCP endpoint', () => {
        const mcpUrl = getManagedAgentMcpUrl(LIGHTDASH_SITE_URL, PROJECT_UUID);
        const config = renderManagedAgentConfig({
            lightdashSiteUrl: LIGHTDASH_SITE_URL,
            projectUuid: PROJECT_UUID,
            skillIds: [],
        });

        expect(mcpUrl).toBe(
            `${LIGHTDASH_SITE_URL}/api/v1/mcp/projects/${PROJECT_UUID}`,
        );
        expect(config.mcp_servers).toEqual([
            {
                name: 'lightdash',
                type: 'url',
                url: mcpUrl,
            },
        ]);
    });
});
