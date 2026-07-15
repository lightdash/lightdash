import { AnyType } from '@lightdash/common';
import { AiAgentExecutionContextFactory } from './AiAgentExecutionContext';

describe('AiAgentExecutionContextFactory', () => {
    it('keeps the resolved runtime capabilities and creates a reproducible safe snapshot', () => {
        const dependencies = { credentialResolver: vi.fn() };
        const mcpToolSetup = { credentials: { token: 'not-persisted' } };
        const context = AiAgentExecutionContextFactory.create(
            {
                userId: 'user-1',
                threadUuid: 'thread-1',
                promptUuid: 'prompt-1',
                model: 'anthropic/claude-sonnet',
                agentSettings: {
                    uuid: 'agent-1',
                    projectUuid: 'project-1',
                    name: 'Analyst',
                    instruction: 'Investigate carefully',
                    version: 2,
                    tags: ['finance'],
                },
                enableDataAccess: true,
                enableContentTools: true,
                enableSelfImprovement: false,
                enableRepoDiscovery: true,
                canRunSql: true,
                mcpServers: [
                    {
                        uuid: 'mcp-1',
                        name: 'CRM',
                        url: 'https://mcp.example.com',
                        authType: 'oauth',
                        resolvedCredentialScope: 'user',
                        updatedAt: new Date('2026-07-15T12:00:00.000Z'),
                        enabledToolNames: ['search'],
                    },
                ],
                knowledgeDocuments: [
                    {
                        uuid: 'document-1',
                        name: 'Metric guide',
                        updatedAt: new Date('2026-07-15T12:00:00.000Z'),
                    },
                ],
                projectContextEnabled: true,
                projectContext: [{ context: 'Fiscal year starts in February' }],
                repoFsRoot: '.',
                repoFsSupportsCodeSearch: true,
                canManageAgent: false,
                enableAiWriteback: false,
                executionMode: 'deep_research',
            } as AnyType,
            { runMetricQuery: {} as AnyType, search: {} as AnyType },
            dependencies,
            mcpToolSetup,
        );

        expect(context.dependencies).toBe(dependencies);
        expect(context.mcpToolSetup).toBe(mcpToolSetup);
        expect(context.snapshot).toMatchObject({
            userUuid: 'user-1',
            projectUuid: 'project-1',
            agentUuid: 'agent-1',
            enabledTools: ['runMetricQuery', 'search'],
            knowledgeDocumentUuids: ['document-1'],
            projectContextEntryCount: 1,
            repositoryAccessEnabled: true,
            canRunSql: true,
        });
        expect(JSON.stringify(context.snapshot)).not.toContain('not-persisted');
    });
});
