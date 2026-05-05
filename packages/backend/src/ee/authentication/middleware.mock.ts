import { Ability } from '@casl/ability';
import {
    OrganizationMemberRole,
    PossibleAbilities,
    ServiceAccount,
    ServiceAccountScope,
    SessionServiceAccount,
    SessionUser,
} from '@lightdash/common';
import express from 'express';
import { BaseService } from '../../services/BaseService';

export const mockServiceAccount: ServiceAccount = {
    uuid: 'test-service-account-uuid',
    createdByUserUuid: 'admin-user-uuid',
    organizationUuid: 'test-org-uuid',
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    expiresAt: null,
    description: 'test scim token',
    lastUsedAt: null,
    rotatedAt: null,
    scopes: [ServiceAccountScope.SCIM_MANAGE],
    userUuid: 'sa-user-uuid',
};

const mockSaSessionUser = {
    userUuid: 'sa-user-uuid',
    userId: 42,
    email: undefined,
    firstName: 'test scim token',
    lastName: '',
    organizationUuid: 'test-org-uuid',
    organizationName: 'Test Org',
    organizationCreatedAt: new Date('2024-01-01T00:00:00.000Z'),
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    isSetupComplete: true,
    role: OrganizationMemberRole.ADMIN,
    isActive: false,
    isPending: false,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    ability: new Ability<PossibleAbilities>([]),
    abilityRules: [],
} as unknown as SessionUser;

export const mockRequest = {
    headers: {
        authorization: 'Bearer scim_test_token',
    },
    method: 'GET',
    path: '/api/v1/scim/v2/Users',
    route: {
        path: '/Users',
    },
    services: {
        getServiceAccountService: jest.fn().mockReturnValue({
            authenticateScim: jest.fn().mockResolvedValue(mockServiceAccount),
        }),
        getUserService: jest.fn().mockReturnValue({
            getSessionUserForServiceAccount: jest
                .fn()
                .mockResolvedValue(mockSaSessionUser),
        }),
    },
} as unknown as express.Request;

export const mockRequestWithInvalidToken = {
    ...mockRequest,
    headers: {
        authorization: 'Bearer invalid_token',
    },
    services: {
        getServiceAccountService: jest.fn().mockReturnValue({
            authenticateScim: jest.fn().mockResolvedValue(null),
        }),
    },
} as unknown as express.Request;

export const mockRequestWithNoToken = {
    ...mockRequest,
    headers: {},
} as unknown as express.Request;

export const mockRequestWithEmptyToken = {
    ...mockRequest,
    headers: {
        authorization: '',
    },
} as unknown as express.Request;

export const mockRequestWithMalformedToken = {
    ...mockRequest,
    headers: {
        authorization: 'Bearer',
    },
} as unknown as express.Request;

export const mockResponse = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
} as unknown as express.Response;

export const mockNext = jest.fn();

export class MockScimService extends BaseService {
    // eslint-disable-next-line class-methods-use-this
    async authenticateToken(): Promise<SessionServiceAccount | null> {
        return mockServiceAccount;
    }
}
