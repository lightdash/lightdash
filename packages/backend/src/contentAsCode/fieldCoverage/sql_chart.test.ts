import { describeContentAsCodeSchemaContract } from './schemaContractTestUtils';

describeContentAsCodeSchemaContract({
    resource: 'sql_chart',
    modelSchema: 'SqlChart',
    documentSchema: 'SqlChartAsCode',
    skippedModelFields: [
        'connectionUuid',
        'createdAt',
        'createdBy',
        'dashboard',
        'firstViewedAt',
        'lastUpdatedAt',
        'lastUpdatedBy',
        'lastViewedAt',
        'organization',
        'project',
        'resolvedColorPalette',
        'savedSqlUuid',
        'space',
        'views',
    ],
    documentOnlyFields: [
        'access',
        'contentType',
        'downloadedAt',
        'spaceSlug',
        'updatedAt',
        'version',
    ],
});
