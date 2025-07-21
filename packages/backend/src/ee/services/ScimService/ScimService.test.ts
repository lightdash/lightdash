import {
    LightdashUser,
    OrganizationMemberRole,
    ScimSchemaType,
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
            // @ts-ignore
            const convertMethod =
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

            // Convert the user to a SCIM user
            const scimUser = convertMethod(testUser);

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
            // @ts-ignore
            const convertMethod =
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

            // Convert the user to a SCIM user
            const scimUser = convertMethod(testUser);

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

    describe('updateUser', () => {
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
});
