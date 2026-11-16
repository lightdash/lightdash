import { describeContentAsCodeSchemaContract } from './schemaContractTestUtils';

describeContentAsCodeSchemaContract({
    resource: 'external_connection',
    modelSchema: 'ExternalConnection',
    documentSchema: 'ExternalConnectionAsCode',
    skippedModelFields: [
        // Live API sources are configured in the app, not as code.
        'aiHint',
        'apiSource',
        'createdAt',
        'createdByUserUuid',
        'externalConnectionUuid',
        'hasSecret',
        'kind',
        // Server-assigned explore-name prefix of a live API source.
        'liveSourceName',
        'organizationUuid',
        'projectUuid',
        // Saved from the connection picker of a live API source.
        'targetLabel',
        // Carried by the document as `authType`.
        'type',
        'updatedAt',
        'updatedByUserUuid',
    ],
    documentOnlyFields: ['authType', 'contentType', 'version'],
});
