import { ScimError } from '@lightdash/common';
import { ServiceAccountService } from '../services/ServiceAccountService/ServiceAccountService';
import {
    mockNext,
    mockRequest,
    mockRequestWithEmptyToken,
    mockRequestWithInvalidToken,
    mockRequestWithMalformedToken,
    mockRequestWithNoToken,
    mockResponse,
    mockServiceAccount,
} from './middleware.mock';
import { isScimAuthenticated } from './middlewares';

describe('SCIM Authentication Middleware', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should authenticate valid SCIM token and attach service account', async () => {
        await isScimAuthenticated(mockRequest, mockResponse, mockNext);

        expect(
            mockRequest.services.getServiceAccountService<ServiceAccountService>()
                .authenticateScim,
        ).toHaveBeenCalledWith('scim_test_token', {
            method: mockRequest.method,
            path: mockRequest.path,
            routePath: mockRequest.route.path,
        });
        expect(mockRequest.serviceAccount).toEqual(mockServiceAccount);
        expect(mockNext).toHaveBeenCalledWith();
    });

    it('should reject invalid SCIM token', async () => {
        await isScimAuthenticated(
            mockRequestWithInvalidToken,
            mockResponse,
            mockNext,
        );

        const [error] = mockNext.mock.calls[0];
        expect(error).toBeInstanceOf(ScimError);
        expect(error.status).toBe('401'); // note: ScimError.status is a string (per SCIM spec)
    });

    it('should reject request with no authorization header', async () => {
        await isScimAuthenticated(
            mockRequestWithNoToken,
            mockResponse,
            mockNext,
        );

        const [error] = mockNext.mock.calls[0];
        expect(error).toBeInstanceOf(ScimError);
        expect(error.status).toBe('401'); // note: ScimError.status is a string (per SCIM spec)
    });

    it('should reject request with empty authorization header', async () => {
        await isScimAuthenticated(
            mockRequestWithEmptyToken,
            mockResponse,
            mockNext,
        );

        const [error] = mockNext.mock.calls[0];
        expect(error).toBeInstanceOf(ScimError);
        expect(error.status).toBe('401'); // note: ScimError.status is a string (per SCIM spec)
    });

    it('should reject malformed authorization header', async () => {
        await isScimAuthenticated(
            mockRequestWithMalformedToken,
            mockResponse,
            mockNext,
        );

        const [error] = mockNext.mock.calls[0];
        expect(error).toBeInstanceOf(ScimError);
        expect(error.status).toBe('401'); // note: ScimError.status is a string (per SCIM spec)
    });
});
