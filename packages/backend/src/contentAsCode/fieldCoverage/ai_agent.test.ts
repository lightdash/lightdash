import { describeContentAsCodeSchemaContract } from './schemaContractTestUtils';

describeContentAsCodeSchemaContract({
    resource: 'ai_agent',
    modelSchema: 'AiAgent',
    documentSchema: 'AgentAsCode',
    skippedModelFields: [
        'adminOnly',
        'createdAt',
        'groupAccess',
        'imageUrlSource',
        'integrations',
        'organizationUuid',
        'projectUuid',
        'spaceAccess',
        'userAccess',
        'uuid',
    ],
    documentOnlyFields: [
        'agentVersion',
        'contentType',
        'downloadedAt',
        'evaluations',
        'slug',
    ],
});
