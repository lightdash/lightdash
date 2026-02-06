import { OrganizationMemberRole } from '@lightdash/common';
import express from 'express';
import { buildAccount, defaultSessionUser } from '../auth/account/account.mock';
import { impersonationMiddleware } from './impersonationMiddleware';

describe('impersonationMiddleware', () => {
    const mockResponse = {} as express.Response;
    const mockNext = jest.fn();

    const adminUser = {
        ...defaultSessionUser,
        userUuid: 'admin-user-uuid',
        role: OrganizationMemberRole.ADMIN,
        organizationUuid: 'org-uuid',
        organizationName: 'Org',
        isActive: true,
    };

    const targetUser = {
        ...defaultSessionUser,
        userUuid: 'target-user-uuid',
        role: OrganizationMemberRole.MEMBER,
        organizationUuid: 'org-uuid',
        organizationName: 'Org',
        isActive: true,
    };

    const getRequest = (
        findSessionUser: jest.Mock,
        overrides: Partial<express.Request> = {},
    ): express.Request =>
        ({
            headers: {},
            user: adminUser,
            account: buildAccount({ accountType: 'session' }),
            services: {
                getUserService: () => ({
                    findSessionUser,
                }),
            },
            session: {
                impersonation: {
                    adminUserUuid: 'admin-user-uuid',
                    adminOrganizationUuid: 'org-uuid',
                    adminName: 'Admin User',
                    targetUserUuid: 'target-user-uuid',
                    targetOrganizationUuid: 'org-uuid',
                    startedAt: new Date().toISOString(),
                },
            },
            ...overrides,
        }) as unknown as express.Request;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('replaces req.user when impersonation session is valid', async () => {
        const findSessionUser = jest
            .fn()
            .mockResolvedValueOnce(adminUser)
            .mockResolvedValueOnce(targetUser);
        const request = getRequest(findSessionUser);

        await impersonationMiddleware(request, mockResponse, mockNext);

        expect(findSessionUser).toHaveBeenCalledTimes(2);
        expect(request.user).toBe(targetUser);
        expect(request.account).toBeUndefined();
        expect(request.session.impersonation).toBeDefined();
        expect(mockNext).toHaveBeenCalledWith();
    });

    it('clears impersonation when admin is no longer authorized', async () => {
        const nonAdminUser = {
            ...adminUser,
            role: OrganizationMemberRole.MEMBER,
        };
        const findSessionUser = jest.fn().mockResolvedValueOnce(nonAdminUser);
        const request = getRequest(findSessionUser);

        await impersonationMiddleware(request, mockResponse, mockNext);

        expect(request.user).toEqual(adminUser);
        expect(request.session.impersonation).toBeUndefined();
        expect(mockNext).toHaveBeenCalledWith();
    });

    it('clears impersonation when target user is no longer valid', async () => {
        const targetInAnotherOrg = {
            ...targetUser,
            organizationUuid: 'other-org-uuid',
        };
        const findSessionUser = jest
            .fn()
            .mockResolvedValueOnce(adminUser)
            .mockResolvedValueOnce(targetInAnotherOrg);
        const request = getRequest(findSessionUser);

        await impersonationMiddleware(request, mockResponse, mockNext);

        expect(request.user).toEqual(adminUser);
        expect(request.session.impersonation).toBeUndefined();
        expect(mockNext).toHaveBeenCalledWith();
    });

    it('does nothing when impersonation is not active', async () => {
        const findSessionUser = jest.fn();
        const request = getRequest(findSessionUser, {
            session: {} as unknown as express.Request['session'],
        });

        await impersonationMiddleware(request, mockResponse, mockNext);

        expect(findSessionUser).not.toHaveBeenCalled();
        expect(request.user).toEqual(adminUser);
        expect(mockNext).toHaveBeenCalledWith();
    });
});
