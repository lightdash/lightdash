import { describeContentAsCodeSchemaContract } from './schemaContractTestUtils';

describeContentAsCodeSchemaContract({
    resource: 'custom_role',
    modelSchema: 'RoleWithScopes',
    documentSchema: 'CustomRoleAsCode',
    skippedModelFields: [
        'createdAt',
        'createdBy',
        'organizationUuid',
        'ownerType',
        'roleUuid',
        'updatedAt',
    ],
    documentOnlyFields: ['version'],
});
