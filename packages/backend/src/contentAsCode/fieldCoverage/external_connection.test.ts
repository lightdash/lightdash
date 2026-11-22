import { describeContentAsCodeSchemaContract } from './schemaContractTestUtils';

describeContentAsCodeSchemaContract({
    resource: 'external_connection',
    modelSchema: 'ExternalConnection',
    documentSchema: 'ExternalConnectionAsCode',
    skippedModelFields: [
        // Who can query a live API source, set in the app by those who manage it.
        'accessRule',
        // Live API sources are configured in the app, not as code.
        'aiHint',
        'apiSource',
        // A live data source's freshness window and last purge.
        'cachePurgedAt',
        'cacheTtlSeconds',
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
