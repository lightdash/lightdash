import { defineAbility, subject } from '@casl/ability';
import { ForcedSubject, type AnyObject } from '@casl/ability/dist/types/types';
import {
    CaslSubjectNames,
    OrganizationMemberRole,
    type Account,
    type ImpersonationContext,
} from '@lightdash/common';
import { type AuditLogEvent } from './auditLog';
import {
    CaslAuditWrapper,
    createActorFromAccount,
    type AuditableUser,
    type AuditLogger,
} from './caslAuditWrapper';

// Test subjects
const createDashboard = (uuid: string, attributes: AnyObject = {}) =>
    subject('Dashboard', {
        organizationUuid: 'test-org-uuid',
        metadata: { dashboardUuid: uuid },
        ...attributes,
    });

const createSavedChart = (uuid: string, attributes: AnyObject = {}) =>
    subject('SavedChart', {
        organizationUuid: 'test-org-uuid',
        metadata: { savedChartUuid: uuid },
        ...attributes,
    });

describe('CaslAuditWrapper', () => {
    // Create a user with only the required fields for AuditableUser
    const mockUser: AuditableUser = {
        userUuid: 'test-user-uuid',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        organizationUuid: 'test-org-uuid',
        role: OrganizationMemberRole.MEMBER,
    };

    // Use function to create fresh instances for each test
    const createMockLogger = (): jest.Mock<void, [AuditLogEvent]> =>
        jest.fn<void, [AuditLogEvent]>();

    // Tests run with a simple set of mock abilities - this does not test the real abilities/permissions in Lightdash
    const createTestAbility = () =>
        defineAbility((can, cannot) => {
            // Simple rule
            can('read', 'Dashboard');

            // Rule with conditions
            can('update', 'Dashboard', { authorId: mockUser.userUuid });

            // Rule with reason
            can('delete', 'Dashboard', { authorId: mockUser.userUuid }).because(
                'User is the author',
            );

            // Forbidden rule with conditions
            cannot('read', 'Dashboard', {
                inheritsFromOrgOrProject: false,
            }).because('Private dashboards are not readable');

            // Rule with multiple conditions
            can('manage', 'SavedChart', {
                authorId: mockUser.userUuid,
                status: 'published',
            });
        });

    // Create a new wrapper for each test - cast ability to avoid complex type issues
    const createWrapper = (mockLogger: jest.Mock<void, [AuditLogEvent]>) =>
        new CaslAuditWrapper(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            createTestAbility() as any,
            mockUser,
            {
                ip: '127.0.0.1',
                userAgent: 'test-agent',
                requestId: 'test-request-id',
                auditLogger: mockLogger as AuditLogger,
            },
        );

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('can method', () => {
        it('should return the same result as the original ability', () => {
            const mockLogger = createMockLogger();
            const wrapper = createWrapper(mockLogger);
            const ability = createTestAbility();

            const publicDashboard = createDashboard('1', {
                authorId: 'someone-else',
            });
            const userDashboard = createDashboard('2', {
                authorId: mockUser.userUuid,
            });
            const privateDashboard = createDashboard('3', {
                inheritsFromOrgOrProject: false,
            });

            // Test various scenarios
            expect(wrapper.can('read', publicDashboard)).toBe(
                ability.can('read', publicDashboard),
            );
            expect(wrapper.can('update', userDashboard)).toBe(
                ability.can('update', userDashboard),
            );
            expect(wrapper.can('update', publicDashboard)).toBe(
                ability.can('update', publicDashboard),
            );
            expect(wrapper.can('read', privateDashboard)).toBe(
                ability.can('read', privateDashboard),
            );
        });

        it('should log the audit event with allowed status when permission is granted', () => {
            const mockLogger = createMockLogger();
            const wrapper = createWrapper(mockLogger);
            const userDashboard = createDashboard('2', {
                authorId: mockUser.userUuid,
            });

            // Act
            wrapper.can('update', userDashboard);

            // Assert
            expect(mockLogger).toHaveBeenCalledTimes(1);

            const loggedEvent = mockLogger.mock.calls[0][0];
            expect(loggedEvent.actor.uuid).toBe(mockUser.userUuid);
            expect(loggedEvent.action).toBe('update');
            expect(loggedEvent.resource.type).toBe('Dashboard');
            expect(loggedEvent.resource.metadata?.dashboardUuid).toBe('2');
            expect(loggedEvent.status).toBe('allowed');
            expect(loggedEvent.context.ip).toBe('127.0.0.1');
            expect(loggedEvent.context.userAgent).toBe('test-agent');
            expect(loggedEvent.context.requestId).toBe('test-request-id');
        });

        it('should log the audit event with denied status when permission is denied', () => {
            const mockLogger = createMockLogger();
            const wrapper = createWrapper(mockLogger);
            const privateDashboard = createDashboard('3', {
                inheritsFromOrgOrProject: false,
            });

            // Act
            wrapper.can('read', privateDashboard);

            // Assert
            expect(mockLogger).toHaveBeenCalledTimes(1);

            const loggedEvent = mockLogger.mock.calls[0][0];
            expect(loggedEvent.actor.uuid).toBe(mockUser.userUuid);
            expect(loggedEvent.action).toBe('read');
            expect(loggedEvent.resource.type).toBe('Dashboard');
            expect(loggedEvent.resource.metadata?.dashboardUuid).toBe('3');
            expect(loggedEvent.status).toBe('denied');
        });

        it('should include the reason when provided by a rule', () => {
            const mockLogger = createMockLogger();
            const wrapper = createWrapper(mockLogger);
            const userDashboard = createDashboard('2', {
                authorId: mockUser.userUuid,
            });

            // Act
            wrapper.can('delete', userDashboard);

            // Assert
            expect(mockLogger).toHaveBeenCalledTimes(1);

            const loggedEvent = mockLogger.mock.calls[0][0];
            expect(loggedEvent.reason).toBe('User is the author');
        });

        it('should include properly formatted rule conditions', () => {
            const mockLogger = createMockLogger();
            const wrapper = createWrapper(mockLogger);
            const userDashboard = createDashboard('2', {
                authorId: mockUser.userUuid,
            });

            // Act
            wrapper.can('update', userDashboard);

            // Assert
            expect(mockLogger).toHaveBeenCalledTimes(1);

            const loggedEvent = mockLogger.mock.calls[0][0];
            expect(loggedEvent.ruleConditions).toBe(
                JSON.stringify({ authorId: mockUser.userUuid }),
            );
        });

        it('should include complex rule conditions correctly', () => {
            const mockLogger = createMockLogger();
            const wrapper = createWrapper(mockLogger);
            const userSavedChart = createSavedChart('1', {
                authorId: mockUser.userUuid,
                status: 'published',
            });

            // Act
            wrapper.can('manage', userSavedChart);

            // Assert
            expect(mockLogger).toHaveBeenCalledTimes(1);

            const loggedEvent = mockLogger.mock.calls[0][0];
            expect(loggedEvent.ruleConditions).toBe(
                JSON.stringify({
                    authorId: mockUser.userUuid,
                    status: 'published',
                }),
            );
        });
    });

    describe('cannot method', () => {
        it('should return the same result as the original ability', () => {
            const mockLogger = createMockLogger();
            const wrapper = createWrapper(mockLogger);
            const ability = createTestAbility();

            const publicDashboard = createDashboard('1', {
                authorId: 'someone-else',
            });
            const userDashboard = createDashboard('2', {
                authorId: mockUser.userUuid,
            });
            const privateDashboard = createDashboard('3', {
                inheritsFromOrgOrProject: false,
            });

            // Test various scenarios
            expect(wrapper.cannot('read', publicDashboard)).toBe(
                ability.cannot('read', publicDashboard),
            );
            expect(wrapper.cannot('update', userDashboard)).toBe(
                ability.cannot('update', userDashboard),
            );
            expect(wrapper.cannot('update', publicDashboard)).toBe(
                ability.cannot('update', publicDashboard),
            );
            expect(wrapper.cannot('read', privateDashboard)).toBe(
                ability.cannot('read', privateDashboard),
            );
        });

        it('should log the audit event with denied status when permission is denied', () => {
            const mockLogger = createMockLogger();
            const wrapper = createWrapper(mockLogger);
            const privateDashboard = createDashboard('3', {
                inheritsFromOrgOrProject: false,
            });

            // Act
            wrapper.cannot('read', privateDashboard);

            // Assert
            expect(mockLogger).toHaveBeenCalledTimes(1);

            const loggedEvent = mockLogger.mock.calls[0][0];
            expect(loggedEvent.actor.uuid).toBe(mockUser.userUuid);
            expect(loggedEvent.action).toBe('read');
            expect(loggedEvent.resource.type).toBe('Dashboard');
            expect(loggedEvent.resource.metadata?.dashboardUuid).toBe('3');
            expect(loggedEvent.status).toBe('denied');
        });

        it('should log the audit event with allowed status when permission is granted', () => {
            const mockLogger = createMockLogger();
            const wrapper = createWrapper(mockLogger);
            const publicDashboard = createDashboard('1');

            // Act
            wrapper.cannot('read', publicDashboard);

            // Assert
            expect(mockLogger).toHaveBeenCalledTimes(1);

            const loggedEvent = mockLogger.mock.calls[0][0];
            expect(loggedEvent.status).toBe('allowed');
        });

        it('should include the reason from cannot rules', () => {
            const mockLogger = createMockLogger();
            const wrapper = createWrapper(mockLogger);
            const privateDashboard = createDashboard('3', {
                inheritsFromOrgOrProject: false,
            });

            // Act
            wrapper.cannot('read', privateDashboard);

            // Assert
            expect(mockLogger).toHaveBeenCalledTimes(1);

            const loggedEvent = mockLogger.mock.calls[0][0];
            expect(loggedEvent.reason).toBe(
                'Private dashboards are not readable',
            );
        });
    });

    describe('rules property', () => {
        it('should expose the original ability rules', () => {
            const mockLogger = createMockLogger();
            const wrapper = createWrapper(mockLogger);
            const ability = createTestAbility();

            expect(wrapper.rules).toEqual(ability.rules);
        });
    });

    describe('default logger', () => {
        it('should not throw if no logger is provided', () => {
            // Use type assertion to satisfy the compiler
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ability = createTestAbility() as any;
            const wrapperWithoutLogger = new CaslAuditWrapper(
                ability,
                mockUser,
            );
            const userDashboard = createDashboard('2', {
                authorId: mockUser.userUuid,
            });

            // Act & Assert - should not throw
            expect(() =>
                wrapperWithoutLogger.can('update', userDashboard),
            ).not.toThrow();
        });
    });

    describe('audit logging resilience', () => {
        it('should return correct result when audit logger throws on can()', () => {
            const throwingLogger = jest.fn(() => {
                throw new Error('Logging infrastructure down');
            }) as unknown as jest.Mock<void, [AuditLogEvent]>;

            const wrapper = new CaslAuditWrapper(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                createTestAbility() as any,
                mockUser,
                { auditLogger: throwingLogger as AuditLogger },
            );

            const dashboard = createDashboard('1');
            expect(wrapper.can('read', dashboard)).toBe(true);
            expect(throwingLogger).toHaveBeenCalledTimes(1);
        });

        it('should return correct result when audit logger throws on cannot()', () => {
            const throwingLogger = jest.fn(() => {
                throw new Error('Logging infrastructure down');
            }) as unknown as jest.Mock<void, [AuditLogEvent]>;

            const wrapper = new CaslAuditWrapper(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                createTestAbility() as any,
                mockUser,
                { auditLogger: throwingLogger as AuditLogger },
            );

            const dashboard = createDashboard('1');
            expect(wrapper.cannot('read', dashboard)).toBe(false);
            expect(throwingLogger).toHaveBeenCalledTimes(1);
        });

        it('should return denied result correctly when audit logger throws', () => {
            const throwingLogger = jest.fn(() => {
                throw new Error('Logging infrastructure down');
            }) as unknown as jest.Mock<void, [AuditLogEvent]>;

            const wrapper = new CaslAuditWrapper(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                createTestAbility() as any,
                mockUser,
                { auditLogger: throwingLogger as AuditLogger },
            );

            const privateDashboard = createDashboard('3', {
                inheritsFromOrgOrProject: false,
            });
            expect(wrapper.can('read', privateDashboard)).toBe(false);
            expect(wrapper.cannot('read', privateDashboard)).toBe(true);
        });
    });

    describe('capability checks (no resource uuid)', () => {
        it('should handle subjects without uuid', () => {
            const mockLogger = createMockLogger();
            const wrapper = createWrapper(mockLogger);

            const capabilitySubject = subject('Dashboard', {
                organizationUuid: 'test-org-uuid',
                projectUuid: 'test-project-uuid',
            }) as ForcedSubject<CaslSubjectNames> & {
                organizationUuid: string;
            };

            wrapper.can('read', capabilitySubject);

            expect(mockLogger).toHaveBeenCalledTimes(1);
            const loggedEvent = mockLogger.mock.calls[0][0];
            expect(loggedEvent.resource.metadata).toBeUndefined();
            expect(loggedEvent.resource.type).toBe('Dashboard');
            expect(loggedEvent.resource.organizationUuid).toBe('test-org-uuid');
        });
    });

    describe('createResourceFromSubject behavior', () => {
        it('should forward metadata object directly', () => {
            const mockLogger = createMockLogger();
            const wrapper = createWrapper(mockLogger);

            const s = subject('Dashboard', {
                organizationUuid: 'test-org-uuid',
                metadata: {
                    dashboardUuid: 'meta-uuid',
                    dashboardName: 'meta-name',
                },
            });

            wrapper.can('read', s);

            const { resource } = mockLogger.mock.calls[0][0];
            expect(resource.metadata).toEqual({
                dashboardUuid: 'meta-uuid',
                dashboardName: 'meta-name',
            });
        });

        it('should have undefined metadata when absent on the subject', () => {
            const mockLogger = createMockLogger();
            const wrapper = createWrapper(mockLogger);

            const s = subject('Dashboard', {
                organizationUuid: 'test-org-uuid',
            });

            wrapper.can('read', s);

            const { resource } = mockLogger.mock.calls[0][0];
            expect(resource.metadata).toBeUndefined();
        });
    });

    describe('bare-string subjects', () => {
        it('should return the same result as the raw ability for can() with bare-string subject', () => {
            const mockLogger = createMockLogger();
            const wrapper = createWrapper(mockLogger);
            const ability = createTestAbility();

            expect(wrapper.can('read', 'Dashboard')).toBe(
                ability.can('read', 'Dashboard'),
            );
        });

        it('should return the same result as the raw ability for cannot() with bare-string subject', () => {
            const mockLogger = createMockLogger();
            const wrapper = createWrapper(mockLogger);
            const ability = createTestAbility();

            expect(wrapper.cannot('read', 'Dashboard')).toBe(
                ability.cannot('read', 'Dashboard'),
            );
        });

        it('should log audit event with type from bare-string subject', () => {
            const mockLogger = createMockLogger();
            const wrapper = createWrapper(mockLogger);

            wrapper.can('read', 'Dashboard');

            expect(mockLogger).toHaveBeenCalledTimes(1);
            const loggedEvent = mockLogger.mock.calls[0][0];
            expect(loggedEvent.resource.type).toBe('Dashboard');
            expect(loggedEvent.resource.organizationUuid).toBe('unknown');
            expect(loggedEvent.resource.metadata).toBeUndefined();
            expect(loggedEvent.resource.projectUuid).toBeUndefined();
        });

        it('should return true for bare-string when conditional rules exist (can-create-somewhere semantics)', () => {
            const conditionalAbility = defineAbility((can) => {
                can('create', 'SavedChart', {
                    authorId: mockUser.userUuid,
                    status: 'published',
                });
            });

            const mockLogger = createMockLogger();
            const wrapper = new CaslAuditWrapper(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                conditionalAbility as any,
                mockUser,
                { auditLogger: mockLogger as AuditLogger },
            );

            expect(wrapper.can('create', 'SavedChart')).toBe(true);
            expect(wrapper.cannot('create', 'SavedChart')).toBe(false);

            expect(mockLogger).toHaveBeenCalledTimes(2);
            const loggedEvent = mockLogger.mock.calls[0][0];
            expect(loggedEvent.status).toBe('allowed');
            expect(loggedEvent.resource.type).toBe('SavedChart');
        });

        it('should not throw when audit logger fails on bare-string subject', () => {
            const throwingLogger = jest.fn(() => {
                throw new Error('Logging infrastructure down');
            }) as unknown as jest.Mock<void, [AuditLogEvent]>;

            const wrapper = new CaslAuditWrapper(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                createTestAbility() as any,
                mockUser,
                { auditLogger: throwingLogger as AuditLogger },
            );

            expect(wrapper.can('read', 'Dashboard')).toBe(true);
            expect(throwingLogger).toHaveBeenCalledTimes(1);
        });
    });

    describe('createActorFromAccount impersonation', () => {
        const impersonation: ImpersonationContext = {
            adminId: 'admin-001',
            adminEmail: 'admin@example.com',
            adminFirstName: 'Jane',
            adminLastName: 'Admin',
            adminRole: OrganizationMemberRole.ADMIN,
        };

        const buildSessionAccount = (overrides: {
            authType: 'session' | 'pat' | 'oauth' | 'service-account';
            withImpersonation: boolean;
        }): Account =>
            ({
                authentication:
                    overrides.authType === 'service-account'
                        ? {
                              type: 'service-account',
                              source: 'src',
                              serviceAccountUuid: 'sa-uuid',
                              serviceAccountDescription: 'ci-deploy',
                          }
                        : { type: overrides.authType, source: 'src' },
                organization: { organizationUuid: 'org-uuid' },
                user: {
                    id: 'user-789',
                    type: 'registered',
                    userUuid: 'user-789',
                    email: 'user@example.com',
                    firstName: 'Target',
                    lastName: 'User',
                    role: OrganizationMemberRole.VIEWER,
                    ...(overrides.withImpersonation ? { impersonation } : {}),
                },
                isAnonymousUser: () => false,
                isServiceAccount: () =>
                    overrides.authType === 'service-account',
            }) as unknown as Account;

        it('should populate impersonatedBy on session actor when impersonation is present', () => {
            const account = buildSessionAccount({
                authType: 'session',
                withImpersonation: true,
            });
            const actor = createActorFromAccount(account);

            expect(actor.type).toBe('session');
            if (actor.type !== 'session') return;
            expect(actor.impersonatedBy).toEqual({
                uuid: 'admin-001',
                email: 'admin@example.com',
                firstName: 'Jane',
                lastName: 'Admin',
                role: OrganizationMemberRole.ADMIN,
            });
        });

        it('should omit impersonatedBy on session actor when impersonation is absent', () => {
            const account = buildSessionAccount({
                authType: 'session',
                withImpersonation: false,
            });
            const actor = createActorFromAccount(account);

            expect(actor.type).toBe('session');
            if (actor.type !== 'session') return;
            expect(actor.impersonatedBy).toBeUndefined();
        });

        it('should not propagate impersonation onto PAT actors', () => {
            const account = buildSessionAccount({
                authType: 'pat',
                withImpersonation: true,
            });
            const actor = createActorFromAccount(account);

            expect(actor.type).toBe('pat');
            if (actor.type !== 'pat') return;
            expect(actor.impersonatedBy).toBeUndefined();
        });

        it('should not propagate impersonation onto OAuth actors', () => {
            const account = buildSessionAccount({
                authType: 'oauth',
                withImpersonation: true,
            });
            const actor = createActorFromAccount(account);

            expect(actor.type).toBe('oauth');
            if (actor.type !== 'oauth') return;
            expect(actor.impersonatedBy).toBeUndefined();
        });

        it('should map service-account UUID and description from authentication', () => {
            const account = buildSessionAccount({
                authType: 'service-account',
                withImpersonation: false,
            });
            const actor = createActorFromAccount(account);

            expect(actor.type).toBe('service-account');
            if (actor.type !== 'service-account') return;
            expect(actor.uuid).toBe('sa-uuid');
            expect(actor.description).toBe('ci-deploy');
            expect(actor.organizationUuid).toBe('org-uuid');
            expect(actor.organizationRole).toBe(OrganizationMemberRole.VIEWER);
        });
    });
});
