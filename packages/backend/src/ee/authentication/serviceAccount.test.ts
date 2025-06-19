import {
    AuthorizationError,
    ServiceAccount,
    ServiceAccountScope,
    SessionUser,
} from '@lightdash/common';
import express from 'express';
import { ServiceAccountService } from '../services/ServiceAccountService/ServiceAccountService';
import { mockNext, mockResponse } from './middleware.mock';
import { authenticateServiceAccount } from './middlewares';
import {
    mockAdminUser,
    mockRequestWithEmptyToken,
    mockRequestWithExpiredToken,
    mockRequestWithInvalidToken,
    mockRequestWithMalformedToken,
    mockRequestWithNonBearerToken,
    mockRequestWithNoToken,
    mockRequestWithValidToken,
    mockServiceAccount,
} from './serviceAccount.mock';

describe('Service Account Authentication Middleware', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should authenticate valid service account token and attach user', async () => {
        await authenticateServiceAccount(
            mockRequestWithValidToken,
            mockResponse,
            mockNext,
        );

        expect(
            mockRequestWithValidToken.services.getServiceAccountService<ServiceAccountService>()
                .authenticateServiceAccount,
        ).toHaveBeenCalledWith('valid_service_account_token');

        expect(mockRequestWithValidToken.serviceAccount).toEqual(
            mockServiceAccount,
        );
        expect(mockRequestWithValidToken.user).toBeDefined();

        const user = mockRequestWithValidToken.user as SessionUser;
        expect(user.userUuid).toBe(mockAdminUser.userUuid);
        expect(user.email).toBe('service-account@lightdash.com');
        expect(user.firstName).toBe('service account');
        expect(user.lastName).toBe(mockServiceAccount.description);
        expect(user.organizationUuid).toBe(mockServiceAccount.organizationUuid);
        expect(user.userId).toBe(mockAdminUser.userId);
        expect(user.ability).toBeDefined();
        expect(mockNext).toHaveBeenCalledWith();
    });

    it('should reject invalid service account token', async () => {
        await authenticateServiceAccount(
            mockRequestWithInvalidToken,
            mockResponse,
            mockNext,
        );

        const [error] = mockNext.mock.calls[0];
        expect(error).toBeInstanceOf(AuthorizationError);
        expect(error.message).toContain('Invalid service account token');
    });

    it('should continue to next middleware when no authorization header is present', async () => {
        await authenticateServiceAccount(
            mockRequestWithNoToken,
            mockResponse,
            mockNext,
        );

        expect(mockNext).toHaveBeenCalledWith();
        expect(mockRequestWithNoToken.serviceAccount).toBeUndefined();
        expect(mockRequestWithNoToken.user).toBeUndefined();
    });

    it('should continue to next middleware when authorization header is empty', async () => {
        await authenticateServiceAccount(
            mockRequestWithEmptyToken,
            mockResponse,
            mockNext,
        );

        expect(mockNext).toHaveBeenCalledWith();
        expect(mockRequestWithEmptyToken.serviceAccount).toBeUndefined();
        expect(mockRequestWithEmptyToken.user).toBeUndefined();
    });

    it('should continue to next middleware when malformed authorization header is provided', async () => {
        await authenticateServiceAccount(
            mockRequestWithMalformedToken,
            mockResponse,
            mockNext,
        );

        expect(mockNext).toHaveBeenCalledWith();
        expect(mockRequestWithEmptyToken.serviceAccount).toBeUndefined();
        expect(mockRequestWithEmptyToken.user).toBeUndefined();
    });

    it('should continue to next middleware when non-Bearer token is provided', async () => {
        await authenticateServiceAccount(
            mockRequestWithNonBearerToken,
            mockResponse,
            mockNext,
        );

        expect(mockNext).toHaveBeenCalledWith();
        expect(mockRequestWithNonBearerToken.serviceAccount).toBeUndefined();
        expect(mockRequestWithNonBearerToken.user).toBeUndefined();
    });

    it('should handle service errors gracefully', async () => {
        const mockRequestWithServiceError = {
            ...mockRequestWithValidToken,
            services: {
                getServiceAccountService: jest.fn().mockReturnValue({
                    authenticateServiceAccount: jest
                        .fn()
                        .mockRejectedValue(new Error('Database error')),
                }),
            },
        } as unknown as express.Request;

        await authenticateServiceAccount(
            mockRequestWithServiceError,
            mockResponse,
            mockNext,
        );

        const [error] = mockNext.mock.calls[0];
        expect(error).toBeInstanceOf(AuthorizationError);
        expect(error.message).toContain('Database error');
    });

    it('should create user with correct service account abilities', async () => {
        await authenticateServiceAccount(
            mockRequestWithValidToken,
            mockResponse,
            mockNext,
        );

        expect(mockRequestWithValidToken.user).toBeDefined();

        const user = mockRequestWithValidToken.user as SessionUser;

        expect(user.ability).toBeDefined();
        expect(user.abilityRules).toBeDefined();
        expect(user.isActive).toBe(true);
        expect(user.isTrackingAnonymized).toBe(false);
        expect(user.isMarketingOptedIn).toBe(false);
        expect(user.isSetupComplete).toBe(true);
    });
});
