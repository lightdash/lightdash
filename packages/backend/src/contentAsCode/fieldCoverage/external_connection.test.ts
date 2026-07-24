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
        'updatedAt',
        'updatedByUserUuid',
    ],
    documentOnlyFields: ['contentType', 'version'],
});
