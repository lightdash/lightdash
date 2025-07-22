import { SessionServiceAccount } from '@lightdash/common';
import express from 'express';
import { BaseService } from '../../services/BaseService';

export const mockServiceAccount: SessionServiceAccount = {
    organizationUuid: 'test-org-uuid',
};

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
