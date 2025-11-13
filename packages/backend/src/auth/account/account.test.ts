import { AbilityBuilder } from '@casl/ability';
import {
    CreateEmbedJwt,
    MemberAbility,
    OrganizationMemberRole,
    OssEmbed,
    SessionUser,
    UserAccessControls,
} from '@lightdash/common';

// Import the functions we want to test
import { fromJwt, fromSession } from './account';

describe('account', () => {
    describe('fromJwt', () => {
        const mockEmbed: OssEmbed = {
            organization: {
                organizationUuid: 'test-org-uuid',
                name: 'Test Organization',
            },
            projectUuid: 'test-project-uuid',
            encodedSecret: 'test-encoded-secret',
            dashboardUuids: ['test-dashboard-uuid'],
            allowAllDashboards: false,
            chartUuids: [],
            allowAllCharts: false,
            createdAt: '2021-01-01',
            user: {
                userUuid: 'test-user-uuid',
                firstName: 'Test',
                lastName: 'User',
            },
        };

        const mockDecodedToken: CreateEmbedJwt = {
            user: {
                externalId: 'external-user-123',
                email: 'external@example.com',
            },
            content: {
                type: 'dashboard',
                dashboardUuid: 'test-dashboard-uuid',
                dashboardFiltersInteractivity: {
                    enabled: true,
                    allowedFilters: ['department', 'region'],
                },
            },
        };

        const mockUserAttributes: UserAccessControls = {
            userAttributes: {
                department: ['engineering'],
                region: ['us-west'],
            },
            intrinsicUserAttributes: {
                email: 'external@example.com',
            },
        };

        it('should create an ExternalAccount from JWT with user externalId', () => {
            const result = fromJwt({
                decodedToken: mockDecodedToken,
                embed: mockEmbed,
                source: 'test-jwt-token',
                content: {
                    type: 'dashboard',
                    dashboardUuid: 'test-dashboard-uuid',
                    chartUuids: [],
                    explores: [],
                },
                userAttributes: mockUserAttributes,
            });

            expect(result.authentication.type).toBe('jwt');
            expect(result.authentication.data).toBe(mockDecodedToken);
            expect(result.authentication.source).toBe('test-jwt-token');

            expect(result.organization).toEqual(mockEmbed.organization);

            expect(result.access.content.dashboardUuid).toBe(
                'test-dashboard-uuid',
            );
            expect(result.access.filtering).toEqual(
                mockDecodedToken.content.type === 'dashboard'
                    ? mockDecodedToken.content.dashboardFiltersInteractivity
                    : undefined,
            );
            expect(result.access.controls).toBe(mockUserAttributes);

            expect(result.user.id).toBe('external::external-user-123');
            expect(result.user.type).toBe('anonymous');
            expect(result.user.email).toBe('external@example.com');
            expect(result.user.isActive).toBe(true);
            expect(result.user.ability.can).toBeDefined();
            expect(result.user.abilityRules.length).toBeGreaterThan(0);
            expect(result.isAuthenticated()).toBe(true);
            expect(result.isJwtUser()).toBe(true);
            expect(result.isAnonymousUser()).toBe(true);
            expect(result.isRegisteredUser()).toBe(false);
            expect(result.isSessionUser()).toBe(false);
        });

        it('should create an ExternalAccount with anonymous ID when no externalId is provided', () => {
            const tokenWithoutExternalId: CreateEmbedJwt = {
                user: {
                    email: 'anonymous@example.com',
                },
                content: {
                    type: 'dashboard',
                    dashboardUuid: 'test-dashboard-uuid',
                    dashboardFiltersInteractivity: {
                        enabled: false,
                        allowedFilters: [],
                    },
                },
            };

            const result = fromJwt({
                decodedToken: tokenWithoutExternalId,
                embed: mockEmbed,
                source: 'anonymous-jwt-token',
                content: {
                    type: 'dashboard',
                    dashboardUuid: 'test-dashboard-uuid',
                    chartUuids: [],
                    explores: [],
                },
                userAttributes: mockUserAttributes,
            });

            expect(result.user.id).toBe(
                `external::${mockEmbed.organization.organizationUuid}_anonymous-jwt-token`,
            );
            expect(result.user.email).toBe('anonymous@example.com');
            expect(result.isAuthenticated()).toBe(true);
        });

        it('should create an AnonymousAccount when user object is undefined', () => {
            const tokenWithoutUser: CreateEmbedJwt = {
                content: {
                    type: 'dashboard',
                    dashboardUuid: 'test-dashboard-uuid',
                    dashboardFiltersInteractivity: {
                        enabled: true,
                        allowedFilters: ['department'],
                    },
                },
            };

            const result = fromJwt({
                decodedToken: tokenWithoutUser,
                embed: mockEmbed,
                source: 'no-user-jwt-token',
                content: {
                    type: 'dashboard',
                    dashboardUuid: 'test-dashboard-uuid',
                    chartUuids: [],
                    explores: [],
                },
                userAttributes: mockUserAttributes,
            });

            expect(result.user.id).toBe(
                `external::${mockEmbed.organization.organizationUuid}_no-user-jwt-token`,
            );
            expect(result.user.email).toBeUndefined();
            expect(result.isAuthenticated()).toBe(true);
        });

        it('should handle empty userAttributes', () => {
            const emptyUserAttributes: UserAccessControls = {
                userAttributes: {},
                intrinsicUserAttributes: {},
            };

            const result = fromJwt({
                decodedToken: mockDecodedToken,
                embed: mockEmbed,
                source: 'test-jwt-token',
                content: {
                    type: 'dashboard',
                    dashboardUuid: 'test-dashboard-uuid',
                    chartUuids: [],
                    explores: [],
                },
                userAttributes: emptyUserAttributes,
            });

            expect(result.access.controls).toEqual(emptyUserAttributes);
        });
    });

    describe('fromSession', () => {
        const mockSessionUser: SessionUser = {
            userUuid: 'session-user-uuid',
            userId: 123,
            role: OrganizationMemberRole.DEVELOPER,
            email: 'session@example.com',
            firstName: 'Session',
            lastName: 'User',
            organizationUuid: 'session-org-uuid',
            organizationName: 'Session Organization',
            organizationCreatedAt: new Date('2024-01-01'),
            isActive: true,
            isTrackingAnonymized: false,
            isMarketingOptedIn: false,
            isSetupComplete: true,
            createdAt: new Date('2024-01-01'),
            updatedAt: new Date('2024-01-01'),
            ability: {
                can: jest.fn(),
                cannot: jest.fn(),
            } as unknown as MemberAbility,
            abilityRules: [{}] as AbilityBuilder<MemberAbility>['rules'],
        };

        it('should create a SessionAccount from session user', () => {
            const result = fromSession(mockSessionUser, 'session-cookie');

            expect(result.authentication.type).toBe('session');
            expect(result.authentication.source).toBe('session-cookie');

            expect(result.organization.organizationUuid).toBe(
                'session-org-uuid',
            );
            expect(result.organization.name).toBe('Session Organization');

            expect(result.user.id).toBe('session-user-uuid');
            expect(result.user.type).toBe('registered');
            expect(result.user.email).toBe('session@example.com');
            expect(result.user.firstName).toBe('Session');
            expect(result.user.lastName).toBe('User');
            expect(result.user.isActive).toBe(true);
            expect(result.user.isTrackingAnonymized).toBe(false);
            expect(result.user.isMarketingOptedIn).toBe(false);
            expect(result.user.isSetupComplete).toBe(true);
            expect(result.user.ability.can).toBeDefined();
            expect(result.user.abilityRules.length).toBeGreaterThan(0);
            expect(result.isAuthenticated()).toBe(true);
            expect(result.isJwtUser()).toBe(false);
            expect(result.isAnonymousUser()).toBe(false);
            expect(result.isRegisteredUser()).toBe(true);
            expect(result.isSessionUser()).toBe(true);
        });

        it('should handle session user with minimal required fields', () => {
            const minimalUser: SessionUser = {
                userUuid: 'minimal-user-uuid',
                userId: 456,
                email: 'minimal@example.com',
                firstName: 'Minimal',
                lastName: 'User',
                organizationUuid: 'minimal-org-uuid',
                organizationName: 'Minimal Organization',
                organizationCreatedAt: new Date(),
                role: OrganizationMemberRole.DEVELOPER,
                isActive: true,
                isTrackingAnonymized: false,
                isMarketingOptedIn: false,
                isSetupComplete: true,
                createdAt: new Date(),
                updatedAt: new Date(),
                ability: {} as MemberAbility,
                abilityRules: {} as AbilityBuilder<MemberAbility>['rules'],
            };

            const result = fromSession(minimalUser, 'minimal-cookie');

            expect(result.user.id).toBe('minimal-user-uuid');
            expect(result.user.email).toBe('minimal@example.com');
            expect(result.user.firstName).toBe('Minimal');
            expect(result.user.lastName).toBe('User');
            expect(result.organization.organizationUuid).toBe(
                'minimal-org-uuid',
            );
            expect(result.organization.name).toBe('Minimal Organization');
            expect(result.isAuthenticated()).toBe(true);
        });

        it('should handle session user with undefined email', () => {
            const userWithUndefinedEmail = {
                ...mockSessionUser,
                email: undefined,
            };

            const result = fromSession(userWithUndefinedEmail);

            expect(result.user.email).toBeUndefined();
            expect(result.isAuthenticated()).toBe(true);
        });
    });
});
