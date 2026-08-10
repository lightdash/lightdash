import {
    DEFAULT_MANAGED_AGENT_POLICY,
    type ManagedAgentPolicy,
} from '@lightdash/common';
import {
    getManagedAgentConfigHash,
    getManagedAgentMcpUrl,
    renderManagedAgentConfig,
} from './agent';

const LIGHTDASH_SITE_URL = 'https://lightdash.example.com';
const PROJECT_UUID = 'd15384cb-8326-433a-a9e9-6f6bb22718f6';

const baseArgs = {
    lightdashSiteUrl: LIGHTDASH_SITE_URL,
    projectUuid: PROJECT_UUID,
    skillIds: [],
};

const customToolNames = (
    config: ReturnType<typeof renderManagedAgentConfig>,
): string[] =>
    (config.tools ?? [])
        .filter((tool) => tool.type === 'custom')
        .map((tool) => (tool.type === 'custom' ? tool.name : ''));

describe('renderManagedAgentConfig', () => {
    it('binds the managed agent to its project-specific MCP endpoint', () => {
        const mcpUrl = getManagedAgentMcpUrl(LIGHTDASH_SITE_URL, PROJECT_UUID);
        const config = renderManagedAgentConfig(baseArgs);

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

    it('instructs the managed agent to use its pinned project', () => {
        const config = renderManagedAgentConfig(baseArgs);

        expect(config.system).toContain(
            'The MCP connection is already pinned to this project.',
        );
        expect(config.system).not.toContain('set_project');
    });
});

describe('renderManagedAgentConfig with policy', () => {
    it('keeps all cleanup tools and default thresholds without a policy', () => {
        const config = renderManagedAgentConfig(baseArgs);
        const tools = customToolNames(config);
        expect(tools).toEqual(
            expect.arrayContaining([
                'flag_content',
                'soft_delete_content',
                'fix_broken_chart',
                'create_content_from_code',
            ]),
        );
        expect(config.system).toContain('not viewed in 90+ days');
        expect(config.system).toContain('Cleanup mode: cleanup');
    });

    it('renders policy values into the prompt and tool descriptions', () => {
        const policy: ManagedAgentPolicy = {
            ...DEFAULT_MANAGED_AGENT_POLICY,
            stalenessChartDays: 180,
            stalenessDashboardDays: 120,
            slowQueryThresholdMs: 5000,
            protectRecentDays: 14,
            escalationHours: 72,
        };
        const config = renderManagedAgentConfig({ ...baseArgs, policy });
        expect(config.system).toContain(
            'Stale charts: not viewed in 180+ days',
        );
        expect(config.system).toContain(
            'Stale dashboards: not viewed in 120+ days',
        );
        expect(config.system).toContain('last 14 days');
        expect(config.system).toContain('72 hours');
        const staleChartsTool = config.tools?.find(
            (tool) =>
                tool.type === 'custom' && tool.name === 'get_stale_charts',
        );
        expect(
            staleChartsTool?.type === 'custom' && staleChartsTool.description,
        ).toContain('180+ days');
        const slowQueriesTool = config.tools?.find(
            (tool) =>
                tool.type === 'custom' && tool.name === 'get_slow_queries',
        );
        expect(
            slowQueriesTool?.type === 'custom' && slowQueriesTool.description,
        ).toContain('5000 ms');
    });

    it('strips soft_delete_content in flag mode', () => {
        const config = renderManagedAgentConfig({
            ...baseArgs,
            policy: { ...DEFAULT_MANAGED_AGENT_POLICY, aggression: 'flag' },
        });
        const tools = customToolNames(config);
        expect(tools).not.toContain('soft_delete_content');
        expect(tools).toContain('flag_content');
        expect(config.system).toContain('FLAG-ONLY MODE');
    });

    it('strips flag and delete tools in observe mode', () => {
        const config = renderManagedAgentConfig({
            ...baseArgs,
            policy: { ...DEFAULT_MANAGED_AGENT_POLICY, aggression: 'observe' },
        });
        const tools = customToolNames(config);
        expect(tools).not.toContain('soft_delete_content');
        expect(tools).not.toContain('flag_content');
        expect(tools).toContain('log_insight');
        expect(config.system).toContain('OBSERVE MODE');
    });

    it('composes aggression stripping with capability gating', () => {
        const config = renderManagedAgentConfig({
            ...baseArgs,
            toolSettings: { modifyExistingContent: false },
            policy: { ...DEFAULT_MANAGED_AGENT_POLICY, aggression: 'flag' },
        });
        const tools = customToolNames(config);
        expect(tools).not.toContain('soft_delete_content');
        expect(tools).not.toContain('fix_broken_chart');
        expect(tools).not.toContain('reverse_own_action');
        expect(tools).toContain('flag_content');
    });

    it('states verified-content protection in the prompt', () => {
        const protectedConfig = renderManagedAgentConfig(baseArgs);
        expect(protectedConfig.system).toContain('Verified content: protected');
        const optedOut = renderManagedAgentConfig({
            ...baseArgs,
            policy: {
                ...DEFAULT_MANAGED_AGENT_POLICY,
                verifiedContent: 'none',
            },
        });
        expect(optedOut.system).toContain('treated like any other content');
    });

    it('keeps the people and ownership tools in every aggression mode', () => {
        (['observe', 'flag', 'cleanup'] as const).forEach((aggression) => {
            const config = renderManagedAgentConfig({
                ...baseArgs,
                policy: { ...DEFAULT_MANAGED_AGENT_POLICY, aggression },
            });
            const tools = customToolNames(config);
            expect(tools).toContain('get_inactive_users');
            expect(tools).toContain('get_orphaned_content');
        });
    });

    it('keeps the people and ownership tools when content capabilities are off', () => {
        const config = renderManagedAgentConfig({
            ...baseArgs,
            toolSettings: {
                createContent: false,
                modifyExistingContent: false,
            },
        });
        const tools = customToolNames(config);
        expect(tools).toContain('get_inactive_users');
        expect(tools).toContain('get_orphaned_content');
    });

    it('tells the agent that people and ownership findings are reporting-only', () => {
        const config = renderManagedAgentConfig(baseArgs);
        expect(config.system).toContain('### 5. People & Ownership');
        expect(config.system).toContain(
            'NEVER flag, delete, or otherwise act on a person or their content',
        );
    });

    it('keeps the unused-agent tool in every aggression mode and with content capabilities off', () => {
        (['observe', 'flag', 'cleanup'] as const).forEach((aggression) => {
            const config = renderManagedAgentConfig({
                ...baseArgs,
                policy: { ...DEFAULT_MANAGED_AGENT_POLICY, aggression },
            });
            expect(customToolNames(config)).toContain('get_unused_agents');
        });

        const noContentCapabilities = renderManagedAgentConfig({
            ...baseArgs,
            toolSettings: {
                createContent: false,
                modifyExistingContent: false,
            },
        });
        expect(customToolNames(noContentCapabilities)).toContain(
            'get_unused_agents',
        );
    });

    it('tells the agent that unused-agent findings are reporting-only', () => {
        const config = renderManagedAgentConfig(baseArgs);
        expect(config.system).toContain('### 6. AI Agent Usage');
        expect(config.system).toContain(
            'NEVER delete, disable, or edit an agent',
        );
        expect(config.system).toContain('### 7. Insights');
        expect(config.system).toContain('### 8. Slack Summary');
    });

    it('omits the pre-aggregate tool and checklist section when pre-aggregates are disabled', () => {
        const config = renderManagedAgentConfig(baseArgs);
        expect(customToolNames(config)).not.toContain('get_preagg_candidates');
        expect(config.system).not.toContain('Pre-Aggregate Candidates');
        expect(config.system).toContain('### 7. Insights');
    });

    it('includes the pre-aggregate tool and renumbers the checklist when enabled', () => {
        (['observe', 'flag', 'cleanup'] as const).forEach((aggression) => {
            const config = renderManagedAgentConfig({
                ...baseArgs,
                preAggregatesEnabled: true,
                policy: { ...DEFAULT_MANAGED_AGENT_POLICY, aggression },
            });
            expect(customToolNames(config)).toContain('get_preagg_candidates');
        });

        const config = renderManagedAgentConfig({
            ...baseArgs,
            preAggregatesEnabled: true,
        });
        expect(config.system).toContain('### 7. Pre-Aggregate Candidates');
        expect(config.system).toContain(
            'NEVER write dbt files or change project configuration',
        );
        expect(config.system).toContain('Quote it verbatim in your insight');
        expect(config.system).toContain('### 8. Insights');
        expect(config.system).toContain('### 9. Slack Summary');
    });

    it('changes the config hash when pre-aggregate availability changes', () => {
        const disabled = getManagedAgentConfigHash(
            renderManagedAgentConfig(baseArgs),
        );
        const enabled = getManagedAgentConfigHash(
            renderManagedAgentConfig({
                ...baseArgs,
                preAggregatesEnabled: true,
            }),
        );
        expect(disabled).not.toBe(enabled);
    });

    it('changes the config hash when policy changes', () => {
        const a = getManagedAgentConfigHash(renderManagedAgentConfig(baseArgs));
        const b = getManagedAgentConfigHash(
            renderManagedAgentConfig({
                ...baseArgs,
                policy: {
                    ...DEFAULT_MANAGED_AGENT_POLICY,
                    stalenessChartDays: 30,
                },
            }),
        );
        expect(a).not.toEqual(b);
    });
});
