import {
    LightdashUser,
    OrganizationMemberRole,
    ScimSchemaType,
    ScimUserRole,
} from '@lightdash/common';
import { ScimPatch } from 'scim-patch';
import { ScimService } from './ScimService';
import { ScimServiceArgumentsMock, mockUser } from './ScimService.mock';

describe('ScimService', () => {
    const service = new ScimService(ScimServiceArgumentsMock);

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('convertLightdashUserToScimUser', () => {
        test('should correctly add role to extension schema', () => {
            // Access the private method using type assertion
            const convertMethod =
                // @ts-expect-error - accessing private method for testing
                service.convertLightdashUserToScimUser.bind(service);

            // Create a test user with a role
            const testUser: LightdashUser = {
                userUuid: 'test-uuid',
                firstName: 'Test',
                lastName: 'User',
                email: 'test@example.com',
                isActive: true,
                role: OrganizationMemberRole.ADMIN,
                createdAt: new Date(),
                updatedAt: new Date(),
                organizationUuid: 'org-uuid',
                userId: 0,
                isTrackingAnonymized: false,
                isMarketingOptedIn: false,
                isSetupComplete: false,
            };

            // Convert the user to a SCIM user with mock roles
            const mockRoles = [
                {
                    value: OrganizationMemberRole.ADMIN,
                    display: OrganizationMemberRole.ADMIN,
                    type: 'Organization',
                    primary: true,
                },
            ];
            const scimUser = convertMethod(testUser, mockRoles);

            // Verify the entire SCIM user object
            expect(scimUser).toEqual({
                schemas: [
                    ScimSchemaType.USER,
                    ScimSchemaType.LIGHTDASH_USER_EXTENSION,
                ],
                id: testUser.userUuid,
                userName: testUser.email,
                name: {
                    givenName: testUser.firstName,
                    familyName: testUser.lastName,
                },
                active: testUser.isActive,
                emails: [
                    {
                        value: testUser.email,
                        primary: true,
                    },
                ],
                roles: [
                    {
                        value: OrganizationMemberRole.ADMIN,
                        display: OrganizationMemberRole.ADMIN,
                        type: 'Organization',
                        primary: true,
                    },
                ],
                [ScimSchemaType.LIGHTDASH_USER_EXTENSION]: {
                    role: OrganizationMemberRole.ADMIN,
                },
                meta: {
                    resourceType: 'User',
                    created: testUser.createdAt,
                    lastModified: testUser.updatedAt,
                    location: expect.stringContaining(
                        `/api/v1/scim/v2/Users/${testUser.userUuid}`,
                    ),
                },
            });
        });

        test('should not add extension schema if user has no role', () => {
            // Access the private method using type assertion
            const convertMethod =
                // @ts-expect-error - accessing private method for testing
                service.convertLightdashUserToScimUser.bind(service);

            // Create a test user without a role
            const testUser: LightdashUser = {
                userUuid: 'test-uuid',
                firstName: 'Test',
                lastName: 'User',
                email: 'test@example.com',
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date(),
                organizationUuid: 'org-uuid',
                userId: 0,
                isTrackingAnonymized: false,
                isMarketingOptedIn: false,
                isSetupComplete: false,
            };

            // Convert the user to a SCIM user with no roles
            const mockRoles: ScimUserRole[] = [];
            const scimUser = convertMethod(testUser, mockRoles);

            // Verify the entire SCIM user object
            expect(scimUser).toEqual({
                schemas: [ScimSchemaType.USER],
                id: testUser.userUuid,
                userName: testUser.email,
                name: {
                    givenName: testUser.firstName,
                    familyName: testUser.lastName,
                },
                active: testUser.isActive,
                emails: [
                    {
                        value: testUser.email,
                        primary: true,
                    },
                ],
                roles: [],
                meta: {
                    resourceType: 'User',
                    created: testUser.createdAt,
                    lastModified: testUser.updatedAt,
                    location: expect.stringContaining(
                        `/api/v1/scim/v2/Users/${testUser.userUuid}`,
                    ),
                },
            });

            // Additional verification that the extension schema is not present
            expect(scimUser.schemas).not.toContain(
                ScimSchemaType.LIGHTDASH_USER_EXTENSION,
            );
            expect(
                scimUser[ScimSchemaType.LIGHTDASH_USER_EXTENSION],
            ).toBeUndefined();
        });
    });

    describe('getScimUserEmail', () => {
        test('should return email when username is a valid email', () => {
            const validEmail = mockUser.email;
            const result = ScimService.getScimUserEmail({
                userName: validEmail,
            });
            expect(result).toBe(validEmail);
        });

        test('should throw error when username is not a valid email', () => {
            expect(() => {
                ScimService.getScimUserEmail({ userName: 'not-an-email' });
            }).toThrow('Username must be a valid email');

            expect(() => {
                ScimService.getScimUserEmail({ userName: '' });
            }).toThrow('Username must be a valid email');

            expect(() => {
                // @ts-ignore
                ScimService.getScimUserEmail({ userName: undefined });
            }).toThrow('Username must be a valid email');
        });
    });

    describe('createUser', () => {
        test('should create user with default role when no role is provided', async () => {
            // Create a SCIM user without a role in the extension schema
            const scimUser = {
                schemas: [ScimSchemaType.USER],
                userName: 'new-user@example.com',
                name: {
                    givenName: 'New',
                    familyName: 'User',
                },
                active: true,
                emails: [
                    {
                        value: 'new-user@example.com',
                        primary: true,
                    },
                ],
            };

            // Call createUser
            await service.createUser({
                user: scimUser,
                organizationUuid: 'org-uuid',
            });

            // Verify that createOrganizationMembershipByUuid was called with the default role
            const { organizationMemberProfileModel } = ScimServiceArgumentsMock;
            expect(
                organizationMemberProfileModel.createOrganizationMembershipByUuid,
            ).toHaveBeenCalledWith({
                organizationUuid: 'org-uuid',
                userUuid: mockUser.userUuid,
                role: OrganizationMemberRole.MEMBER, // Default role
            });
        });

        test('should create user with provided role when valid role is in extension schema', async () => {
            // Create a SCIM user with a valid role in the extension schema
            const scimUser = {
                schemas: [
                    ScimSchemaType.USER,
                    ScimSchemaType.LIGHTDASH_USER_EXTENSION,
                ],
                userName: 'new-user@example.com',
                name: {
                    givenName: 'New',
                    familyName: 'User',
                },
                active: true,
                emails: [
                    {
                        value: 'new-user@example.com',
                        primary: true,
                    },
                ],
                [ScimSchemaType.LIGHTDASH_USER_EXTENSION]: {
                    role: OrganizationMemberRole.ADMIN, // Valid role
                },
            };

            // Call createUser
            await service.createUser({
                user: scimUser,
                organizationUuid: 'org-uuid',
            });

            // Verify that createOrganizationMembershipByUuid was called with the provided role
            const { organizationMemberProfileModel } = ScimServiceArgumentsMock;
            expect(
                organizationMemberProfileModel.createOrganizationMembershipByUuid,
            ).toHaveBeenCalledWith({
                organizationUuid: 'org-uuid',
                userUuid: mockUser.userUuid,
                role: OrganizationMemberRole.ADMIN, // Provided role
            });
        });

        test('should throw error when invalid role is provided in extension schema', async () => {
            // Create a SCIM user with an invalid role in the extension schema
            const scimUser = {
                schemas: [
                    ScimSchemaType.USER,
                    ScimSchemaType.LIGHTDASH_USER_EXTENSION,
                ],
                userName: 'new-user@example.com',
                name: {
                    givenName: 'New',
                    familyName: 'User',
                },
                active: true,
                emails: [
                    {
                        value: 'new-user@example.com',
                        primary: true,
                    },
                ],
                [ScimSchemaType.LIGHTDASH_USER_EXTENSION]: {
                    role: 'invalid_role', // Invalid role
                },
            };

            // Call createUser with the invalid role and expect it to throw an error
            await expect(
                service.createUser({
                    user: scimUser,
                    organizationUuid: 'org-uuid',
                }),
            ).rejects.toThrow(/Invalid role/);
        });
    });

    describe('updateUser', () => {
        test('should downgrade role to MEMBER and remove project and group memberships when deactivating user', async () => {
            const { organizationMemberProfileModel, rolesModel, groupsModel } =
                ScimServiceArgumentsMock;

            // Force current org role to ADMIN so downgrade path is executed
            jest.spyOn(
                organizationMemberProfileModel,
                'getOrganizationMemberByUuid',
            ).mockResolvedValueOnce({
                ...mockUser,
                role: OrganizationMemberRole.ADMIN,
            });

            // Deactivation payload
            const scimUser = {
                schemas: [ScimSchemaType.USER],
                userName: mockUser.email,
                name: {
                    givenName: mockUser.firstName,
                    familyName: mockUser.lastName,
                },
                active: false,
                emails: [
                    {
                        value: mockUser.email,
                        primary: true,
                    },
                ],
            };

            await service.updateUser({
                user: scimUser,
                userUuid: mockUser.userUuid,
                organizationUuid: mockUser.organizationUuid,
            });

            // Org role downgraded to MEMBER
            expect(
                organizationMemberProfileModel.updateOrganizationMember,
            ).toHaveBeenCalledWith(
                mockUser.organizationUuid,
                mockUser.userUuid,
                { role: OrganizationMemberRole.MEMBER },
            );

            // Removed from all projects
            expect(
                rolesModel.removeUserAccessFromAllProjects,
            ).toHaveBeenCalledWith(mockUser.userUuid);

            // Removed from all groups in org
            expect(groupsModel.removeUserFromAllGroups).toHaveBeenCalledWith({
                organizationUuid: mockUser.organizationUuid,
                userUuid: mockUser.userUuid,
            });
        });

        test('should throw error when an invalid role is provided', async () => {
            // Create a SCIM user with an invalid role in the extension schema
            const scimUser = {
                schemas: [
                    ScimSchemaType.USER,
                    ScimSchemaType.LIGHTDASH_USER_EXTENSION,
                ],
                userName: mockUser.email,
                name: {
                    givenName: mockUser.firstName,
                    familyName: mockUser.lastName,
                },
                active: mockUser.isActive,
                emails: [
                    {
                        value: mockUser.email,
                        primary: true,
                    },
                ],
                [ScimSchemaType.LIGHTDASH_USER_EXTENSION]: {
                    role: 'invalid_role', // This is not a valid OrganizationMemberRole
                },
            };

            // Call updateUser with the invalid role and expect it to throw an error
            await expect(
                service.updateUser({
                    user: scimUser,
                    userUuid: mockUser.userUuid,
                    organizationUuid: mockUser.organizationUuid,
                }),
            ).rejects.toThrow(/Invalid role/);
        });

        test('should update user role when a valid role is provided', async () => {
            // Create a SCIM user with a valid role in the extension schema
            const scimUser = {
                schemas: [
                    ScimSchemaType.USER,
                    ScimSchemaType.LIGHTDASH_USER_EXTENSION,
                ],
                userName: mockUser.email,
                name: {
                    givenName: mockUser.firstName,
                    familyName: mockUser.lastName,
                },
                active: mockUser.isActive,
                emails: [
                    {
                        value: mockUser.email,
                        primary: true,
                    },
                ],
                [ScimSchemaType.LIGHTDASH_USER_EXTENSION]: {
                    role: OrganizationMemberRole.ADMIN, // This is a valid OrganizationMemberRole
                },
            };

            // Reset mocks to ensure clean state
            jest.clearAllMocks();

            // Call updateUser with the valid role
            await service.updateUser({
                user: scimUser,
                userUuid: mockUser.userUuid,
                organizationUuid: mockUser.organizationUuid,
            });

            // Verify that updateOrganizationMember was called with the correct role
            const { organizationMemberProfileModel } = ScimServiceArgumentsMock;
            expect(
                organizationMemberProfileModel.updateOrganizationMember,
            ).toHaveBeenCalledWith(
                mockUser.organizationUuid,
                mockUser.userUuid,
                {
                    role: OrganizationMemberRole.ADMIN,
                },
            );
        });

        test('should update user project roles when roles array is provided', async () => {
            const { rolesModel } = ScimServiceArgumentsMock;

            // Create a SCIM user with project roles
            const scimUser = {
                schemas: [ScimSchemaType.USER],
                userName: mockUser.email,
                name: {
                    givenName: mockUser.firstName,
                    familyName: mockUser.lastName,
                },
                active: mockUser.isActive,
                emails: [
                    {
                        value: mockUser.email,
                        primary: true,
                    },
                ],
                roles: [
                    {
                        value: 'project-1-uuid:admin', // Project-level system role
                        display: 'Analytics Project - Admin',
                        type: 'Project - Analytics Project',
                        primary: false,
                    },
                    {
                        value: 'project-2-uuid:custom-role-1-uuid', // Project-level custom role
                        display: 'Marketing Project - Custom Role',
                        type: 'Project - Analytics Project',
                        primary: false,
                    },
                    {
                        value: OrganizationMemberRole.EDITOR, // Organization-level role
                        display: 'Editor',
                        type: 'Organization',
                        primary: true,
                    },
                ],
            };

            // Reset mocks to ensure clean state
            jest.clearAllMocks();

            // Call updateUser with roles
            await service.updateUser({
                user: scimUser,
                userUuid: mockUser.userUuid,
                organizationUuid: mockUser.organizationUuid,
            });

            expect(rolesModel.setUserOrgAndProjectRoles).toHaveBeenCalledWith(
                mockUser.organizationUuid,
                mockUser.userUuid,
                OrganizationMemberRole.EDITOR,
                [
                    { projectUuid: 'project-1-uuid', roleId: 'admin' },
                    {
                        projectUuid: 'project-2-uuid',
                        roleId: 'custom-role-1-uuid',
                    },
                ],
                true, // excludeProjectPreviews
            );
        });

        test('should handle organization-only roles in roles array via unified method', async () => {
            const { organizationMemberProfileModel, rolesModel } =
                ScimServiceArgumentsMock;

            // Create a SCIM user with only organization roles
            const scimUser = {
                schemas: [ScimSchemaType.USER],
                userName: mockUser.email,
                name: {
                    givenName: mockUser.firstName,
                    familyName: mockUser.lastName,
                },
                active: mockUser.isActive,
                emails: [
                    {
                        value: mockUser.email,
                        primary: true,
                    },
                ],
                roles: [
                    {
                        value: OrganizationMemberRole.VIEWER,
                        display: 'Viewer',
                        type: 'Organization',
                        primary: true,
                    },
                ],
            };

            // Reset mocks to ensure clean state
            jest.clearAllMocks();

            // Call updateUser with organization role
            await service.updateUser({
                user: scimUser,
                userUuid: mockUser.userUuid,
                organizationUuid: mockUser.organizationUuid,
            });

            // Verify unified method called with empty project roles
            expect(rolesModel.setUserOrgAndProjectRoles).toHaveBeenCalledWith(
                mockUser.organizationUuid,
                mockUser.userUuid,
                OrganizationMemberRole.VIEWER,
                [],
                true, // excludeProjectPreviews
            );
        });
    });

    describe('patchUser', () => {
        test('should update user role when a valid role is provided in patch operation with path', async () => {
            // Mock the updateUser method to return a SCIM user
            const updateUserMethod = jest.spyOn(service, 'updateUser');

            // Create a patch operation to update the role with path
            const patchOp: ScimPatch = {
                schemas: [ScimSchemaType.PATCH],
                Operations: [
                    {
                        op: 'Add',
                        path: `${ScimSchemaType.LIGHTDASH_USER_EXTENSION}:role`,
                        value: OrganizationMemberRole.ADMIN,
                    },
                ],
            };

            // Call patchUser with the patch operation
            await service.patchUser({
                userUuid: mockUser.userUuid,
                organizationUuid: mockUser.organizationUuid,
                patchOp,
            });

            // Verify that updateUser was called with correct role
            expect(updateUserMethod).toHaveBeenCalledTimes(1);
            expect(updateUserMethod).toHaveBeenCalledWith(
                expect.objectContaining({
                    user: expect.objectContaining({
                        schemas: [
                            ScimSchemaType.USER,
                            ScimSchemaType.LIGHTDASH_USER_EXTENSION,
                        ],
                        [ScimSchemaType.LIGHTDASH_USER_EXTENSION]: {
                            role: OrganizationMemberRole.ADMIN,
                        },
                    }),
                }),
            );
        });
    });

    describe('parseRoleId', () => {
        test('should parse role ID without colon as organization role', () => {
            const roleId = 'admin';
            const result = ScimService.parseRoleId(roleId);

            expect(result).toEqual({
                roleUuid: 'admin',
                projectUuid: undefined,
            });
        });

        test('should parse role ID with colon as project role', () => {
            const roleId = 'project-uuid-123:viewer';
            const result = ScimService.parseRoleId(roleId);

            expect(result).toEqual({
                roleUuid: 'viewer',
                projectUuid: 'project-uuid-123',
            });
        });

        test('should handle custom role UUID with colon', () => {
            const roleId = 'project-uuid-456:custom-role-uuid-789';
            const result = ScimService.parseRoleId(roleId);

            expect(result).toEqual({
                roleUuid: 'custom-role-uuid-789',
                projectUuid: 'project-uuid-456',
            });
        });

        test('should handle empty string as role ID', () => {
            const roleId = '';
            const result = ScimService.parseRoleId(roleId);

            expect(result).toEqual({
                roleUuid: '',
                projectUuid: undefined,
            });
        });

        test('should handle role ID with multiple colons', () => {
            const roleId = 'project:with:colons:role-id';
            const result = ScimService.parseRoleId(roleId);

            // Only splits on the first colon, so everything after becomes the roleUuid
            expect(result).toEqual({
                roleUuid: 'with:colons:role-id',
                projectUuid: 'project',
            });
        });
    });

    describe('validateRolesArray', () => {
        const validRoleValues = [
            'admin',
            'editor',
            'viewer',
            'project-1-uuid:admin',
            'project-1-uuid:viewer',
            'project-2-uuid:custom-role-uuid',
        ];

        test('should validate a correct roles array', () => {
            const roles = [
                {
                    value: 'admin',
                    display: 'Admin',
                    type: 'Organization',
                    primary: true,
                },
                {
                    value: 'project-1-uuid:viewer',
                    display: 'Project 1 - Viewer',
                    type: 'Project - Project 1',
                    primary: false,
                },
            ];

            expect(() => {
                ScimService.validateRolesArray(roles, validRoleValues);
            }).not.toThrow();
        });

        test('should not throw error for empty roles array (skip updates)', () => {
            expect(() => {
                ScimService.validateRolesArray([], validRoleValues);
            }).not.toThrow();
        });

        test('should throw error for invalid role values', () => {
            const roles = [
                {
                    value: 'invalid-role',
                    display: 'Invalid Role',
                    type: 'Organization',
                    primary: true,
                },
            ];

            expect(() => {
                ScimService.validateRolesArray(roles, validRoleValues);
            }).toThrow('Invalid role values: invalid-role');
        });

        test('should throw error for no organization role', () => {
            const roles = [
                {
                    value: 'project-1-uuid:admin',
                    display: 'Project 1 - Admin',
                    type: 'Project - Project 1',
                    primary: false,
                },
            ];

            expect(() => {
                ScimService.validateRolesArray(roles, validRoleValues);
            }).toThrow(
                'Roles array must contain exactly one organization role, found 0',
            );
        });

        test('should throw error for multiple organization roles', () => {
            const roles = [
                {
                    value: 'admin',
                    display: 'Admin',
                    type: 'Organization',
                    primary: true,
                },
                {
                    value: 'editor',
                    display: 'Editor',
                    type: 'Organization',
                    primary: false,
                },
            ];

            expect(() => {
                ScimService.validateRolesArray(roles, validRoleValues);
            }).toThrow(
                'Roles array must contain exactly one organization role, found 2',
            );
        });

        test('should throw error for duplicate project roles', () => {
            const roles = [
                {
                    value: 'admin',
                    display: 'Admin',
                    type: 'Organization',
                    primary: true,
                },
                {
                    value: 'project-1-uuid:admin',
                    display: 'Project 1 - Admin',
                    type: 'Project - Project 1',
                    primary: false,
                },
                {
                    value: 'project-1-uuid:viewer',
                    display: 'Project 1 - Viewer',
                    type: 'Project - Project 1',
                    primary: false,
                },
            ];

            expect(() => {
                ScimService.validateRolesArray(roles, validRoleValues);
            }).toThrow(
                'Roles array can only contain one role per project. Duplicate project UUIDs: project-1-uuid',
            );
        });
    });

    describe('parseRoleId and generateRoleId integration', () => {
        test('should be able to round-trip organization role', () => {
            const mock = {
                roleUuid: 'admin',
            };
            const id = ScimService.generateRoleId(mock);
            expect(id).toBe('admin');
            expect(ScimService.parseRoleId(id)).toEqual(mock);
        });

        test('should be able to round-trip project role', () => {
            const mock = {
                roleUuid: 'viewer',
                projectUuid: 'project-uuid-123',
            };
            const id = ScimService.generateRoleId(mock);
            expect(id).toBe('project-uuid-123:viewer');
            expect(ScimService.parseRoleId(id)).toEqual(mock);
        });

        test('should be able to round-trip project custom role', () => {
            const mock = {
                roleUuid: 'custom-role-uuid-789',
                projectUuid: 'project-uuid-123',
            };
            const id = ScimService.generateRoleId(mock);
            expect(id).toBe('project-uuid-123:custom-role-uuid-789');
            expect(ScimService.parseRoleId(id)).toEqual(mock);
        });
    });

    describe('convertScimToKnexPagination', () => {
        test('should return correct pagination for valid startIndex multiple of count', () => {
            const result = ScimService.convertScimToKnexPagination(1, 10);
            expect(result).toEqual({ pageSize: 10, page: 1 });
        });

        test('should treat startIndex as 1 if less than 1', () => {
            const result = ScimService.convertScimToKnexPagination(-5, 10);
            expect(result).toEqual({ pageSize: 10, page: 1 });
        });

        test('should return correct pagination for valid startIndex not multiple of count', () => {
            expect(ScimService.convertScimToKnexPagination(11, 10)).toEqual({
                pageSize: 10,
                page: 2,
            });
            expect(ScimService.convertScimToKnexPagination(21, 10)).toEqual({
                pageSize: 10,
                page: 3,
            });
            expect(ScimService.convertScimToKnexPagination(1, 2)).toEqual({
                pageSize: 2,
                page: 1,
            });
            expect(ScimService.convertScimToKnexPagination(3, 2)).toEqual({
                pageSize: 2,
                page: 2,
            });
            expect(ScimService.convertScimToKnexPagination(11, 2)).toEqual({
                pageSize: 2,
                page: 6,
            });
            expect(ScimService.convertScimToKnexPagination(51, 50)).toEqual({
                pageSize: 50,
                page: 2,
            });
            expect(ScimService.convertScimToKnexPagination(101, 50)).toEqual({
                pageSize: 50,
                page: 3,
            });
        });

        test('should throw error for invalid startIndex not multiple of count', () => {
            expect(() =>
                ScimService.convertScimToKnexPagination(2, 10),
            ).toThrow();
            expect(() =>
                ScimService.convertScimToKnexPagination(22, 10),
            ).toThrow();
            expect(() =>
                ScimService.convertScimToKnexPagination(2, 2),
            ).toThrow();
        });
    });

    describe('Discovery Endpoints', () => {
        describe('getServiceProviderConfig', () => {
            test('should return correct service provider config', async () => {
                const config = ScimService.getServiceProviderConfig();

                expect(config).toEqual({
                    schemas: [ScimSchemaType.SERVICE_PROVIDER_CONFIG],
                    documentationUri: 'https://docs.lightdash.com/guides/scim',
                    patch: { supported: true },
                    bulk: { supported: false },
                    filter: { supported: true, maxResults: 200 },
                    changePassword: { supported: false },
                    sort: { supported: false },
                    etag: { supported: false },
                    authenticationSchemes: [
                        {
                            type: 'oauthbearertoken',
                            name: 'OAuth Bearer Token',
                            description:
                                'Authentication scheme using the OAuth 2.0 Bearer Token standard',
                            primary: true,
                        },
                    ],
                });
            });
        });

        describe('getSchemas', () => {
            test('should return correct schemas array', async () => {
                const schemasResponse = ScimService.getSchemas();

                expect(schemasResponse.schemas).toEqual([
                    ScimSchemaType.LIST_RESPONSE,
                ]);
                expect(schemasResponse.totalResults).toBe(6);
                expect(schemasResponse.itemsPerPage).toBe(6);
                expect(schemasResponse.startIndex).toBe(1);
                expect(schemasResponse.Resources).toHaveLength(6);
                expect(schemasResponse.Resources.map((s) => s.id)).toEqual([
                    ScimSchemaType.USER,
                    ScimSchemaType.GROUP,
                    ScimSchemaType.ROLE,
                    ScimSchemaType.LIGHTDASH_USER_EXTENSION,
                    ScimSchemaType.SERVICE_PROVIDER_CONFIG,
                    ScimSchemaType.RESOURCE_TYPE,
                ]);

                // Test User schema
                const userSchema = schemasResponse.Resources.find(
                    (s) => s.id === ScimSchemaType.USER,
                );
                expect(userSchema).toBeDefined();
                expect(userSchema!.name).toBe('User');
                expect(userSchema!.attributes).toContainEqual(
                    expect.objectContaining({
                        name: 'userName',
                        type: 'string',
                        required: true,
                        uniqueness: 'server',
                    }),
                );

                // Test Group schema
                const groupSchema = schemasResponse.Resources.find(
                    (s) => s.id === ScimSchemaType.GROUP,
                );
                expect(groupSchema).toBeDefined();
                expect(groupSchema!.name).toBe('Group');
                expect(groupSchema!.attributes).toContainEqual(
                    expect.objectContaining({
                        name: 'displayName',
                        type: 'string',
                        required: true,
                    }),
                );

                // Test Lightdash extension schema
                const extensionSchema = schemasResponse.Resources.find(
                    (s) => s.id === ScimSchemaType.LIGHTDASH_USER_EXTENSION,
                );
                expect(extensionSchema).toBeDefined();
                expect(extensionSchema!.name).toBe('Lightdash User Extension');
                expect(extensionSchema!.attributes).toContainEqual(
                    expect.objectContaining({
                        name: 'role',
                        type: 'string',
                        canonicalValues: [
                            'admin',
                            'editor',
                            'interactive_viewer',
                            'viewer',
                        ],
                    }),
                );

                // Test ServiceProviderConfig schema
                const serviceProviderConfigSchema =
                    schemasResponse.Resources.find(
                        (s) => s.id === ScimSchemaType.SERVICE_PROVIDER_CONFIG,
                    );
                expect(serviceProviderConfigSchema).toBeDefined();
                expect(serviceProviderConfigSchema!.name).toBe(
                    'Service Provider Configuration',
                );
                expect(serviceProviderConfigSchema!.attributes).toContainEqual(
                    expect.objectContaining({
                        name: 'documentationUri',
                        type: 'reference',
                        required: false,
                    }),
                );

                // Test ResourceType schema
                const resourceTypeSchema = schemasResponse.Resources.find(
                    (s) => s.id === ScimSchemaType.RESOURCE_TYPE,
                );
                expect(resourceTypeSchema).toBeDefined();
                expect(resourceTypeSchema!.name).toBe('Resource Type');
                expect(resourceTypeSchema!.attributes).toContainEqual(
                    expect.objectContaining({
                        name: 'name',
                        type: 'string',
                        required: true,
                    }),
                );
            });
        });

        describe('getResourceTypes', () => {
            test('should return correct resource types as array', async () => {
                const resourceTypesResponse = ScimService.getResourceTypes();

                expect(resourceTypesResponse.schemas).toEqual([
                    ScimSchemaType.LIST_RESPONSE,
                ]);
                expect(resourceTypesResponse.totalResults).toBe(3);
                expect(resourceTypesResponse.itemsPerPage).toBe(3);
                expect(resourceTypesResponse.startIndex).toBe(1);
                expect(resourceTypesResponse.Resources).toHaveLength(3);

                // Test User resource type
                const userResourceType = resourceTypesResponse.Resources.find(
                    (rt) => rt.name === 'User',
                );
                expect(userResourceType).toEqual({
                    schemas: [ScimSchemaType.RESOURCE_TYPE],
                    id: 'User',
                    name: 'User',
                    description: 'User Account',
                    endpoint: '/Users',
                    schema: ScimSchemaType.USER,
                    schemaExtensions: [
                        {
                            schema: ScimSchemaType.LIGHTDASH_USER_EXTENSION,
                            required: false,
                        },
                    ],
                    meta: {
                        resourceType: 'ResourceType',
                        location: expect.stringContaining(
                            '/api/v1/scim/v2/ResourceTypes/User',
                        ),
                    },
                });

                // Test Group resource type
                const groupResourceType = resourceTypesResponse.Resources.find(
                    (rt) => rt.name === 'Group',
                );
                expect(groupResourceType).toEqual({
                    schemas: [ScimSchemaType.RESOURCE_TYPE],
                    id: 'Group',
                    name: 'Group',
                    description: 'Group',
                    endpoint: '/Groups',
                    schema: ScimSchemaType.GROUP,
                    meta: {
                        resourceType: 'ResourceType',
                        location: expect.stringContaining(
                            '/api/v1/scim/v2/ResourceTypes/Group',
                        ),
                    },
                });
            });
        });
    });

    describe('Roles', () => {
        describe('listRoles', () => {
            test('should return system roles', async () => {
                const organizationUuid = 'test-org-uuid';

                const result = await service.listRoles({
                    organizationUuid,
                });

                expect(result).toEqual({
                    schemas: [ScimSchemaType.LIST_RESPONSE],
                    totalResults: 20, // 6 org system + 7 per project (2 projects) = 6+14 = 20
                    itemsPerPage: 100,
                    startIndex: 1,
                    Resources: expect.arrayContaining([
                        expect.objectContaining({
                            schemas: [ScimSchemaType.ROLE],
                            value: expect.any(String),
                            display: expect.any(String),
                            type: expect.any(String),
                            supported: true,
                            meta: expect.objectContaining({
                                resourceType: 'Role',
                                location: expect.stringContaining(
                                    '/api/v1/scim/v2/Roles/',
                                ),
                            }),
                        }),
                    ]),
                });

                // Verify we have the expected number of roles
                expect(result.Resources).toHaveLength(20);

                // Verify some specific role values
                const roleValues = result.Resources.map((role) => role.value);
                expect(roleValues).toContain('admin'); // org-level system role
                expect(roleValues).toContain('viewer'); // org-level system role
                expect(roleValues).toContain('editor'); // org-level system role
                expect(roleValues).toContain('project-1-uuid:admin'); // project-level system role
                expect(roleValues).toContain(
                    'project-1-uuid:custom-role-1-uuid',
                ); // project-level custom role
                expect(roleValues).toContain('project-2-uuid:admin'); // project-level system role
                expect(roleValues).toContain(
                    'project-2-uuid:custom-role-2-uuid',
                ); // project-level custom role

                // Verify we don't have preview project roles
                const previewRoles = roleValues.filter((value) =>
                    value.includes('preview-project-uuid'),
                );
                expect(previewRoles).toHaveLength(0);
            });
        });

        describe('getRole', () => {
            test('should return a specific role by ID', async () => {
                const organizationUuid = 'test-org-uuid';
                const roleId = 'admin';

                const result = await service.getRole(organizationUuid, roleId);

                expect(result).toEqual({
                    schemas: [ScimSchemaType.ROLE],
                    id: 'admin',
                    value: 'admin',
                    display: 'Admin',
                    type: expect.any(String),
                    supported: true,
                    meta: {
                        resourceType: 'Role',
                        created: undefined, // System roles don't have creation dates
                        lastModified: undefined, // System roles don't have modification dates
                        location: expect.stringContaining(
                            '/api/v1/scim/v2/Roles/admin',
                        ),
                    },
                });
            });

            test('should return a specific project-level role by composite ID', async () => {
                const organizationUuid = 'test-org-uuid';
                const roleId = 'project-1-uuid:admin';

                const result = await service.getRole(organizationUuid, roleId);

                expect(result).toEqual({
                    schemas: [ScimSchemaType.ROLE],
                    id: 'project-1-uuid:admin',
                    value: 'project-1-uuid:admin',
                    display: 'Analytics Project - Admin',
                    type: expect.any(String),
                    supported: true,
                    meta: {
                        resourceType: 'Role',
                        created: undefined, // System roles don't have creation dates
                        lastModified: undefined, // System roles don't have modification dates
                        location: expect.stringContaining(
                            '/api/v1/scim/v2/Roles/project-1-uuid:admin',
                        ),
                    },
                });
            });

            test('should throw error for non-existent role', async () => {
                const organizationUuid = 'test-org-uuid';
                const roleId = 'non-existent-role';

                await expect(
                    service.getRole(organizationUuid, roleId),
                ).rejects.toThrow('Role with ID non-existent-role not found');
            });
        });
    });
});
