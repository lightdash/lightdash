import { describeContentAsCodeSchemaContract } from './schemaContractTestUtils';

describeContentAsCodeSchemaContract({
    resource: 'user',
    modelSchema: 'OrganizationMemberProfile',
    documentSchema: 'UserAsCode',
    skippedModelFields: [
        'avatarGradient',
        'avatarUrl',
        'isActive',
        'isInviteExpired',
        'isPending',
        'hasMultipleRoles',
        'organizationUuid',
        'roleUuid',
        'userCreatedAt',
        'userUpdatedAt',
        'userUuid',
    ],
    documentOnlyFields: ['additionalRoles', 'disabled', 'version'],
});
