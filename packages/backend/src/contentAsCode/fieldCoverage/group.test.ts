import { describeContentAsCodeSchemaContract } from './schemaContractTestUtils';

describeContentAsCodeSchemaContract({
    resource: 'group',
    modelSchema: 'Group',
    documentSchema: 'GroupAsCode',
    skippedModelFields: [
        'createdAt',
        'createdByUserUuid',
        'organizationUuid',
        'updatedAt',
        'updatedByUserUuid',
        'uuid',
    ],
    documentOnlyFields: ['members', 'version'],
});
