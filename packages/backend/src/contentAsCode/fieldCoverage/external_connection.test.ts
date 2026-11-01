import { describeContentAsCodeSchemaContract } from './schemaContractTestUtils';

describeContentAsCodeSchemaContract({
    resource: 'external_connection',
    modelSchema: 'ExternalConnection',
    documentSchema: 'ExternalConnectionAsCode',
    skippedModelFields: [
        // Live API sources are configured in the app, not as code.
        'apiSource',
        'createdAt',
        'createdByUserUuid',
        'externalConnectionUuid',
        'hasSecret',
        'kind',
        'organizationUuid',
        'projectUuid',
        // Carried by the document as `authType`.
        'type',
        'updatedAt',
        'updatedByUserUuid',
    ],
    documentOnlyFields: ['authType', 'contentType', 'version'],
});
