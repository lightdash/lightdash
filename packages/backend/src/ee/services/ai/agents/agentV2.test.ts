import type { AiAgentArgs, AiAgentDependencies } from '../types/aiAgent';
import { getAgentTools, type AgentMcpToolSetup } from './agentV2';

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
    }): AiAgentArgs =>
        ({
            agentSettings: { name: 'test-agent' },
            autoApproveSql: false,
            autoApproveSqlUserUuid: null,
            availableSkills: [],
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
});
