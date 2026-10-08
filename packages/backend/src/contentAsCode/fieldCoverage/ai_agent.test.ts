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
        // Credential pins reference org-specific credential uuids, which do
        // not port across organizations or instances.
        'providerCredentialUuid',
        'spaceAccess',
        'userAccess',
        'uuid',
    ],
    documentOnlyFields: [
        'agentVersion',
        'contentType',
        'downloadedAt',
        'evaluations',
        'skills',
        'slug',
    ],
});
