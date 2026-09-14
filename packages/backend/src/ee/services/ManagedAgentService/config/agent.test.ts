import {
    DEFAULT_MANAGED_AGENT_POLICY,
    type ManagedAgentPolicy,
} from '@lightdash/common';
import {
    AUTOPILOT_CHART_SKILL_NAME,
    autopilotToolDefinitions,
    renderAutopilotAgent,
    toAutopilotToolJsonSchema,
} from './agent';

const baseArgs = {};

const customToolNames = (
    config: ReturnType<typeof renderAutopilotAgent>,
): string[] => config.tools.map((tool) => tool.name);

describe('renderAutopilotAgent with policy', () => {
    it('keeps all cleanup tools and default thresholds without a policy', () => {
        const config = renderAutopilotAgent(baseArgs);
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
        const config = renderAutopilotAgent({ ...baseArgs, policy });
        expect(config.system).toContain(
            'Stale charts: not viewed in 180+ days',
        );
        expect(config.system).toContain(
            'Stale dashboards: not viewed in 120+ days',
        );
        expect(config.system).toContain('last 14 days');
        expect(config.system).toContain('72 hours');
        const staleChartsTool = config.tools.find(
            (tool) => tool.name === 'get_stale_charts',
        );
        expect(staleChartsTool?.description).toContain('180+ days');
        const slowQueriesTool = config.tools.find(
            (tool) => tool.name === 'get_slow_queries',
        );
        expect(slowQueriesTool?.description).toContain('5000 ms');
    });

    it('strips soft_delete_content in flag mode', () => {
        const config = renderAutopilotAgent({
            ...baseArgs,
            policy: { ...DEFAULT_MANAGED_AGENT_POLICY, aggression: 'flag' },
        });
        const tools = customToolNames(config);
        expect(tools).not.toContain('soft_delete_content');
        expect(tools).toContain('flag_content');
        expect(config.system).toContain('FLAG-ONLY MODE');
    });

    it('strips flag and delete tools in observe mode', () => {
        const config = renderAutopilotAgent({
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
        const config = renderAutopilotAgent({
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
        const protectedConfig = renderAutopilotAgent(baseArgs);
        expect(protectedConfig.system).toContain('Verified content: protected');
        const optedOut = renderAutopilotAgent({
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
            const config = renderAutopilotAgent({
                ...baseArgs,
                policy: { ...DEFAULT_MANAGED_AGENT_POLICY, aggression },
            });
            const tools = customToolNames(config);
            expect(tools).toContain('get_inactive_users');
            expect(tools).toContain('get_orphaned_content');
        });
    });

    it('keeps the people and ownership tools when content capabilities are off', () => {
        const config = renderAutopilotAgent({
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
        const config = renderAutopilotAgent(baseArgs);
        expect(config.system).toContain('### 5. People & Ownership');
        expect(config.system).toContain(
            'NEVER flag, delete, or otherwise act on a person or their content',
        );
    });

    it('keeps the unused-agent tool in every aggression mode and with content capabilities off', () => {
        (['observe', 'flag', 'cleanup'] as const).forEach((aggression) => {
            const config = renderAutopilotAgent({
                ...baseArgs,
                policy: { ...DEFAULT_MANAGED_AGENT_POLICY, aggression },
            });
            expect(customToolNames(config)).toContain('get_unused_agents');
        });

        const noContentCapabilities = renderAutopilotAgent({
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
        const config = renderAutopilotAgent(baseArgs);
        expect(config.system).toContain('### 6. AI Agent Usage');
        expect(config.system).toContain(
            'NEVER delete, disable, or edit an agent',
        );
        expect(config.system).toContain('### 7. Insights');
        expect(config.system).toContain('### 8. Slack Summary');
    });

    it('omits the pre-aggregate tool and checklist section when pre-aggregates are disabled', () => {
        const config = renderAutopilotAgent(baseArgs);
        expect(customToolNames(config)).not.toContain('get_preagg_candidates');
        expect(config.system).not.toContain('Pre-Aggregate Candidates');
        expect(config.system).toContain('### 7. Insights');
    });

    it('includes the pre-aggregate tool and renumbers the checklist when enabled', () => {
        (['observe', 'flag', 'cleanup'] as const).forEach((aggression) => {
            const config = renderAutopilotAgent({
                ...baseArgs,
                preAggregatesEnabled: true,
                policy: { ...DEFAULT_MANAGED_AGENT_POLICY, aggression },
            });
            expect(customToolNames(config)).toContain('get_preagg_candidates');
        });

        const config = renderAutopilotAgent({
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
});

describe('renderAutopilotAgent', () => {
    it('points the agent at in-process tools and loadSkill', () => {
        const { system, tools } = renderAutopilotAgent();

        expect(system).not.toContain('MCP');
        expect(system).toContain('grepFields and getMetadata');
        expect(system).toContain('Call runMetricQuery');
        expect(system).toContain(
            `Call loadSkill with name "${AUTOPILOT_CHART_SKILL_NAME}"`,
        );
        expect(system).toContain(
            'The published report is written afterwards from the evidence you gathered',
        );
        expect(tools.map((tool) => tool.name)).toContain('write_slack_summary');
        expect(
            tools.find((tool) => tool.name === 'create_content_from_code')
                ?.description,
        ).not.toContain('MCP');
    });
});

describe('broken-content action contracts', () => {
    it('records project-wide insights without accepting a model-supplied target', () => {
        const tool = autopilotToolDefinitions.find(
            (item) => item.name === 'log_project_insight',
        );
        if (!tool) throw new Error('log_project_insight is not defined');
        const inputSchema = toAutopilotToolJsonSchema(tool);
        expect(inputSchema.properties).not.toHaveProperty('target_uuid');
        expect(inputSchema.required).toEqual(['description']);
    });

    it('selects one deleted-model group action from policy and capabilities', () => {
        for (const aggression of ['observe', 'flag', 'cleanup'] as const) {
            for (const modifyExistingContent of [true, false]) {
                const config = renderAutopilotAgent({
                    policy: { ...DEFAULT_MANAGED_AGENT_POLICY, aggression },
                    toolSettings: { modifyExistingContent },
                });
                const names = config.tools.map((tool) => tool.name);
                const canDelete =
                    aggression === 'cleanup' && modifyExistingContent;
                expect(names.includes('bulk_delete_broken_content')).toBe(
                    canDelete,
                );
                expect(names.includes('bulk_flag_broken_content')).toBe(
                    aggression !== 'observe' && !canDelete,
                );
                expect(names.includes('flag_content')).toBe(
                    aggression !== 'observe',
                );
                expect(names.includes('soft_delete_content')).toBe(canDelete);
            }
        }
    });

    it('removes group flagging in observe mode', () => {
        const config = renderAutopilotAgent({
            policy: { ...DEFAULT_MANAGED_AGENT_POLICY, aggression: 'observe' },
        });
        expect(config.tools.map((tool) => tool.name)).not.toContain(
            'bulk_flag_broken_content',
        );
    });
});
