import { describeContentAsCodeSchemaContract } from './schemaContractTestUtils';

describeContentAsCodeSchemaContract({
    resource: 'virtual_view',
    modelSchema: 'Explore',
    documentSchema: 'VirtualViewAsCode',
    skippedModelFields: [
        'aiHint',
        'baseTable',
        'caseSensitive',
        'databricksCompute',
        // External source explores are not content-as-code'd; virtual views
        // never carry this ref
        'externalSource',
        'granularityLabels',
        'groupLabel',
        'groups',
        'joinedTables',
        'label',
        'preAggregateSource',
        'preAggregates',
        'savedParameterValues',
        'spotlight',
        'sqlPath',
        'tables',
        'tags',
        'targetDatabase',
        'type',
        'unfilteredTables',
        'warehouse',
        'warnings',
        'ymlPath',
    ],
    documentOnlyFields: ['columns', 'contentType', 'slug', 'sql', 'version'],
});
