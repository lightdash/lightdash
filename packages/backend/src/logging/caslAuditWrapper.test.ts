import { defineAbility, subject } from '@casl/ability';
import { ForcedSubject, type AnyObject } from '@casl/ability/dist/types/types';
import { CaslSubjectNames, OrganizationMemberRole } from '@lightdash/common';
import { type AuditLogEvent } from './auditLog';
import {
    CaslAuditWrapper,
    type AuditLogger,
    type AuditableUser,
} from './caslAuditWrapper';

// Test subjects
const createDashboard = (uuid: string, attributes: AnyObject = {}) =>
    subject('Dashboard', {
        uuid,
        organizationUuid: 'test-org-uuid',
        ...attributes,
    });

const createSavedChart = (uuid: string, attributes: AnyObject = {}) =>
    subject('SavedChart', {
        uuid,
        organizationUuid: 'test-org-uuid',
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
            cannot('read', 'Dashboard', { isPrivate: true }).because(
                'Private dashboards are not readable',
            );

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
            const privateDashboard = createDashboard('3', { isPrivate: true });

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
            expect(loggedEvent.resource.uuid).toBe('2');
            expect(loggedEvent.status).toBe('allowed');
            expect(loggedEvent.context.ip).toBe('127.0.0.1');
            expect(loggedEvent.context.userAgent).toBe('test-agent');
            expect(loggedEvent.context.requestId).toBe('test-request-id');
        });

        it('should log the audit event with denied status when permission is denied', () => {
            const mockLogger = createMockLogger();
            const wrapper = createWrapper(mockLogger);
            const privateDashboard = createDashboard('3', { isPrivate: true });

            // Act
            wrapper.can('read', privateDashboard);

            // Assert
            expect(mockLogger).toHaveBeenCalledTimes(1);

            const loggedEvent = mockLogger.mock.calls[0][0];
            expect(loggedEvent.actor.uuid).toBe(mockUser.userUuid);
            expect(loggedEvent.action).toBe('read');
            expect(loggedEvent.resource.type).toBe('Dashboard');
            expect(loggedEvent.resource.uuid).toBe('3');
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
            const privateDashboard = createDashboard('3', { isPrivate: true });

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
            const privateDashboard = createDashboard('3', { isPrivate: true });

            // Act
            wrapper.cannot('read', privateDashboard);

            // Assert
            expect(mockLogger).toHaveBeenCalledTimes(1);

            const loggedEvent = mockLogger.mock.calls[0][0];
            expect(loggedEvent.actor.uuid).toBe(mockUser.userUuid);
            expect(loggedEvent.action).toBe('read');
            expect(loggedEvent.resource.type).toBe('Dashboard');
            expect(loggedEvent.resource.uuid).toBe('3');
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
            const privateDashboard = createDashboard('3', { isPrivate: true });

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
});
