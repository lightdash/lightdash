import { describeContentAsCodeSchemaContract } from './schemaContractTestUtils';

describeContentAsCodeSchemaContract({
    resource: 'user',
    modelSchema: 'OrganizationMemberProfile',
    documentSchema: 'UserAsCode',
    skippedModelFields: [
        'avatarGradient',
        'avatarUrl',
        'firstName',
        'isActive',
        'isInviteExpired',
        'isPending',
        'lastName',
        'hasMultipleRoles',
        'organizationUuid',
        'roleUuid',
        'userCreatedAt',
        'userUpdatedAt',
        'userUuid',
    ],
    documentOnlyFields: ['additionalRoles', 'disabled', 'version'],
});
