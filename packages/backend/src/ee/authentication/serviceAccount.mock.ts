/*
Service accounts
*/
import { Ability } from '@casl/ability';
import {
    OrganizationMemberRole,
    PossibleAbilities,
    ServiceAccount,
    ServiceAccountScope,
    SessionUser,
} from '@lightdash/common';
import express from 'express';

// Mock service account data
export const mockServiceAccount: ServiceAccount = {
    uuid: 'test-service-account-uuid',
    createdByUserUuid: 'test-user-uuid',
    organizationUuid: 'test-org-uuid',
    createdAt: new Date('2024-01-01'),
    expiresAt: new Date('2025-01-01'),
    description: 'Test service account',
    lastUsedAt: null,
    rotatedAt: null,
    scopes: [ServiceAccountScope.ORG_ADMIN],
    userUuid: 'sa-dedicated-user-uuid',
    roleUuid: null,
    createdBy: null,
};

export const mockExpiredServiceAccount: ServiceAccount = {
    ...mockServiceAccount,
    expiresAt: new Date('2020-01-01'), // Expired
};

export const mockOrganization = {
    name: 'Test Organization',
    organizationUuid: 'test-org-uuid',
};

export const mockSaSessionUser = {
    userUuid: 'sa-dedicated-user-uuid',
    userId: 42,
    email: undefined,
    firstName: 'Test service account',
    lastName: '',
    organizationUuid: 'test-org-uuid',
    organizationName: 'Test Organization',
    organizationCreatedAt: new Date('2024-01-01'),
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    timezone: null,
    isSetupComplete: true,
    role: OrganizationMemberRole.ADMIN,
    isActive: false,
    isPending: false,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ability: new Ability<PossibleAbilities>([]),
    abilityRules: [],
} as unknown as SessionUser;

// Mock requests for different scenarios
export const mockRequestWithValidToken = {
    headers: {
        authorization: 'Bearer valid_service_account_token',
    },
    services: {
        getServiceAccountService: jest.fn().mockReturnValue({
            authenticateServiceAccount: jest
                .fn()
                .mockResolvedValue(mockServiceAccount),
        }),
        getUserService: jest.fn().mockReturnValue({
            getSessionUserForServiceAccount: jest
                .fn()
                .mockResolvedValue(mockSaSessionUser),
        }),
    },
} as unknown as express.Request;

export const mockRequestWithInvalidToken = {
    ...mockRequestWithValidToken,
    headers: {
        authorization: 'Bearer invalid_token',
    },
    services: {
        getServiceAccountService: jest.fn().mockReturnValue({
            authenticateServiceAccount: jest.fn().mockResolvedValue(null),
        }),
    },
} as unknown as express.Request;

export const mockRequestWithExpiredToken = {
    ...mockRequestWithValidToken,
    headers: {
        authorization: 'Bearer expired_token',
    },
    services: {
        getServiceAccountService: jest.fn().mockReturnValue({
            authenticateServiceAccount: jest
                .fn()
                .mockResolvedValue(mockExpiredServiceAccount),
        }),
    },
} as unknown as express.Request;

export const mockRequestWithNoToken = {
    headers: {},
    services: {
        getServiceAccountService: jest.fn().mockReturnValue({
            authenticateServiceAccount: jest.fn().mockResolvedValue(null),
        }),
    },
} as unknown as express.Request;

export const mockRequestWithEmptyToken = {
    headers: {
        authorization: '',
    },
    services: {
        getServiceAccountService: jest.fn().mockReturnValue({
            authenticateServiceAccount: jest.fn().mockResolvedValue(null),
        }),
    },
} as unknown as express.Request;

export const mockRequestWithMalformedToken = {
    headers: {
        authorization: 'Bearer',
    },
    services: {
        getServiceAccountService: jest.fn().mockReturnValue({
            authenticateServiceAccount: jest.fn().mockResolvedValue(null),
        }),
    },
} as unknown as express.Request;

export const mockRequestWithNonBearerToken = {
    headers: {
        authorization: 'ApiKey some_api_key',
    },
    services: {
        getServiceAccountService: jest.fn().mockReturnValue({
            authenticateServiceAccount: jest.fn().mockResolvedValue(null),
        }),
    },
} as unknown as express.Request;
