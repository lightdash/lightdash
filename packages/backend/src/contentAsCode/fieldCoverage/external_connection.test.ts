import { describeContentAsCodeSchemaContract } from './schemaContractTestUtils';

describeContentAsCodeSchemaContract({
    resource: 'external_connection',
    modelSchema: 'ExternalConnection',
    documentSchema: 'ExternalConnectionAsCode',
    skippedModelFields: [
        'createdAt',
        'createdByUserUuid',
        'externalConnectionUuid',
        'hasSecret',
        'organizationUuid',
        'projectUuid',
        // Carried by the document as `authType`.
        'type',
        'updatedAt',
        'updatedByUserUuid',
    ],
    documentOnlyFields: ['authType', 'contentType', 'version'],
});
