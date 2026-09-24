import { describeContentAsCodeSchemaContract } from './schemaContractTestUtils';

describeContentAsCodeSchemaContract({
    resource: 'sql_chart',
    modelSchema: 'SqlChart',
    documentSchema: 'SqlChartAsCode',
    skippedModelFields: [
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
        'warehouseConnectionUuid',
    ],
    documentOnlyFields: [
        'access',
        'connection',
        'contentType',
        'downloadedAt',
        'spaceSlug',
        'updatedAt',
        'version',
    ],
});
