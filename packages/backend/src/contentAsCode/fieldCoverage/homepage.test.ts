import { describeContentAsCodeSchemaContract } from './schemaContractTestUtils';

describeContentAsCodeSchemaContract({
    resource: 'homepage',
    modelSchema: 'ProjectHomepage',
    documentSchema: 'HomepageAsCode',
    skippedModelFields: [
        'homepageUuid',
        'projectUuid',
        'draftConfig',
        'publishedConfig',
        'isDefault',
        'createdByUserUuid',
        'createdAt',
        'updatedAt',
    ],
    documentOnlyFields: ['contentType', 'version', 'config', 'publication'],
});
