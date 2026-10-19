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
        // Names and emails resolved from `userAccess`; read-only and, like the
        // access lists, specific to this organization's users.
        'userAccessDetails',
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
