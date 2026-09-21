import { describeContentAsCodeSchemaContract } from './schemaContractTestUtils';

describeContentAsCodeSchemaContract({
    resource: 'user_attribute',
    modelSchema: 'UserAttribute',
    documentSchema: 'UserAttributeAsCode',
    skippedModelFields: [
        'uuid',
        'createdAt',
        'organizationUuid',
        'attributeDefault',
    ],
    documentOnlyFields: ['version'],
});
