import type { AiAgentArgs, AiAgentDependencies } from '../types/aiAgent';
import {
    getAgentTools,
    normalizeToolOutput,
    type AgentMcpToolSetup,
} from './agentV2';

describe('normalizeToolOutput', () => {
    it('preserves built-in tool output result and metadata', () => {
        expect(
            normalizeToolOutput({
                result: 'ok',
                metadata: { status: 'success' },
            }),
        ).toEqual({
            result: 'ok',
            metadata: { status: 'success' },
        });
    });

    it('stores plain-text MCP output', () => {
        expect(normalizeToolOutput('plain text')).toEqual({
            result: 'plain text',
        });
    });

    it('stores structured MCP output as JSON text', () => {
        const output = {
            content: [{ type: 'text', text: 'hello' }],
        };

        expect(normalizeToolOutput(output)).toEqual({
            result: JSON.stringify(output),
        });
    });

    it('always returns a string result for empty MCP output', () => {
        expect(normalizeToolOutput(undefined)).toEqual({
            result: 'undefined',
        });
    });
});

// Change B: the workstream tools (listWorkstreams, closePullRequest) are shared
// by the general coding agent (editRepo) and the dbt-writeback agent
// (editDbtProject). Both can now drive several PRs per thread, so the gate
// widened from `enableCodingAgent` to `enableCodingAgent || enableAiWriteback`.
describe('getAgentTools workstream tool gate', () => {
    // Tool factories only capture their inputs at construction, so a Proxy that
    // hands back a fresh vi.fn() for every dependency access is enough to build
    // the whole tool set without enumerating all ~46 dependencies.
    const depsStub = () =>
        new Proxy({}, { get: () => vi.fn() }) as unknown as AiAgentDependencies;

    const mcpStub: AgentMcpToolSetup = {
        tools: {},
        mcpToolNameToServerUuid: {},
        unavailableMcpServers: [],
        closeMcpClients: () => Promise.resolve(),
    };

    const buildArgs = (flags: {
        enableCodingAgent: boolean;
        enableAiWriteback: boolean;
        availableSkills?: AiAgentArgs['availableSkills'];
    }): AiAgentArgs =>
        ({
            agentSettings: { name: 'test-agent' },
            autoApproveSql: false,
            autoApproveSqlUserUuid: null,
            availableSkills: flags.availableSkills ?? [],
            callOptions: {},
            canManageAgent: false,
            canRunSql: true,
            debugLoggingEnabled: false,
            enableContentTools: false,
            enableDataAccess: false,
            enableEditProjectContext: false,
            enableGrepFields: false,
            enablePreviewDeploySetup: false,
            enableRepoDiscovery: false,
            enableSearchSemanticLayer: false,
            findExploresFieldSearchSize: 10,
            findFieldsPageSize: 10,
            getDashboardChartsPageSize: 10,
            maxQueryLimit: 5000,
            model: {},
            organizationId: 'org-1',
            projectContextEnabled: false,
            promptUuid: 'prompt-1',
            providerOptions: {},
            runSqlMaxLimit: 5000,
            siteUrl: 'http://localhost',
            telemetryEnabled: false,
            threadUuid: 'thread-1',
            toolDescriptionMaxChars: 1000,
            userId: 'user-1',
            useSlackStreamCard: false,
            ...flags,
        }) as unknown as AiAgentArgs;

    const toolNames = (flags: {
        enableCodingAgent: boolean;
        enableAiWriteback: boolean;
        availableSkills?: AiAgentArgs['availableSkills'];
    }) =>
        Object.keys(
            getAgentTools(buildArgs(flags), depsStub(), [], mcpStub, new Map()),
        );

    it('exposes listWorkstreams + closePullRequest when AI writeback is enabled (coding agent off)', () => {
        const names = toolNames({
            enableCodingAgent: false,
            enableAiWriteback: true,
        });
        expect(names).toContain('listWorkstreams');
        expect(names).toContain('closePullRequest');
        expect(names).toContain('getPullRequestDiff');
        expect(names).toContain('editDbtProject');
        expect(names).not.toContain('editRepo');
    });

    it('still exposes them for the general coding agent (writeback off) — unchanged', () => {
        const names = toolNames({
            enableCodingAgent: true,
            enableAiWriteback: false,
        });
        expect(names).toContain('listWorkstreams');
        expect(names).toContain('closePullRequest');
        expect(names).toContain('getPullRequestDiff');
        expect(names).toContain('editRepo');
    });

    it('omits them when neither coding agent nor writeback is enabled', () => {
        const names = toolNames({
            enableCodingAgent: false,
            enableAiWriteback: false,
        });
        expect(names).not.toContain('listWorkstreams');
        expect(names).not.toContain('closePullRequest');
        expect(names).not.toContain('getPullRequestDiff');
    });

    it('exposes loadSkill when focused skills are available and content tools are off', () => {
        const names = toolNames({
            enableCodingAgent: false,
            enableAiWriteback: false,
            availableSkills: [
                {
                    name: 'answering-data-questions',
                    description: 'Data answering workflow',
                    resources: [],
                },
            ],
        });

        expect(names).toContain('loadSkill');
    });

    it('only loads skills included in availableSkills', async () => {
        const loadSkill = vi.fn(async (name: string) => ({
            name,
            description: 'Allowed skill',
            body: 'Allowed body',
            resources: [],
        }));
        const deps = new Proxy(
            {},
            {
                get: (_, prop) => (prop === 'loadSkill' ? loadSkill : vi.fn()),
            },
        ) as unknown as AiAgentDependencies;
        const tools = getAgentTools(
            buildArgs({
                enableCodingAgent: false,
                enableAiWriteback: false,
                availableSkills: [
                    {
                        name: 'answering-data-questions',
                        description: 'Data answering workflow',
                        resources: [],
                    },
                ],
            }),
            deps,
            [],
            mcpStub,
            new Map(),
        );

        if (!tools.loadSkill.execute) {
            throw new Error('loadSkill execute is missing');
        }
        const executeOptions = {} as Parameters<
            typeof tools.loadSkill.execute
        >[1];
        const allowed = await tools.loadSkill.execute(
            { name: 'answering-data-questions' },
            executeOptions,
        );
        const unavailable = await tools.loadSkill.execute(
            { name: 'developing-lightdash-content' },
            executeOptions,
        );

        expect(allowed.result).toContain('Allowed body');
        expect(unavailable.result).toContain(
            'Skill "developing-lightdash-content" was not found.',
        );
        expect(loadSkill).toHaveBeenCalledTimes(1);
        expect(loadSkill).toHaveBeenCalledWith('answering-data-questions');
    });
});
