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
        'organizationUuid',
        'roleUuid',
        'userCreatedAt',
        'userUpdatedAt',
        'userUuid',
    ],
    documentOnlyFields: ['disabled', 'version'],
});
