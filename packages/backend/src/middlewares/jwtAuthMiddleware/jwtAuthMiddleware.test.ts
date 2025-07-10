import {
    EmbedJwt,
    ForbiddenError,
    JWT_HEADER_NAME,
    Organization,
} from '@lightdash/common';
import express from 'express';
import { jwtAuthMiddleware } from './jwtAuthMiddleware';

// Mock the JWT utility
jest.mock('../../auth/lightdashJwt', () => ({
    decodeLightdashJwt: jest.fn(),
    JWT_HEADER_NAME: 'lightdash-embed-token',
}));

const { decodeLightdashJwt } = require('../../auth/lightdashJwt');

describe('Embed Auth Middleware', () => {
    let mockRequest: Partial<express.Request>;
    let mockResponse: Partial<express.Response>;
    let mockNext: jest.Mock;

    const mockProjectUuid = 'test-project-uuid';
    const mockOrganizationUuid = 'test-org-uuid';
    const mockEmbedToken = 'test-embed-token';
    const mockEncodedSecret = Buffer.from('test-secret');

    const mockEmbedJwt: EmbedJwt = {
        content: {
            type: 'dashboard',
            dashboardUuid: 'test-dashboard-uuid',
        },
        exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
        iat: Math.floor(Date.now() / 1000),
        user: {
            externalId: 'test-external-id',
            email: 'test@example.com',
        },
    };

    const mockOrganization: Pick<Organization, 'organizationUuid' | 'name'> = {
        organizationUuid: mockOrganizationUuid,
        name: 'Test Organization',
    };

    const mockEmbedService = {
        getEmbeddingByProjectId: jest.fn().mockResolvedValue({
            encodedSecret: mockEncodedSecret,
            organization: mockOrganization,
        }),
        getDashboardUuidFromJwt: jest
            .fn()
            .mockResolvedValue('test-dashboard-uuid'),
        getEmbedUserAttributes: jest.fn().mockResolvedValue({
            userAttributes: {},
            intrinsicUserAttributes: {},
        }),
    };

    beforeEach(() => {
        jest.clearAllMocks();

        mockRequest = {
            path: `/api/v1/embed/${mockProjectUuid}/dashboard`,
            query: {},
            headers: {},
            services: {
                getEmbedService: jest.fn().mockReturnValue(mockEmbedService),
            } as unknown as express.Request['services'],
        } as Partial<express.Request>;

        mockResponse = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        } as Partial<express.Response>;

        mockNext = jest.fn();
    });

    describe('Successful authentication scenarios', () => {
        it('should authenticate with embed token from lightdash-embed-token header', async () => {
            mockRequest.headers = { [JWT_HEADER_NAME]: mockEmbedToken };
            decodeLightdashJwt.mockReturnValue(mockEmbedJwt);

            await jwtAuthMiddleware(
                mockRequest as express.Request,
                mockResponse as express.Response,
                mockNext,
            );

            expect(mockRequest.account).toBeDefined();
            expect(mockNext).toHaveBeenCalledWith();
        });
    });

    describe('Fallback to regular auth scenarios', () => {
        it('should call next() when no project UUID in path', async () => {
            mockRequest.path = '/api/v1/some-other-path';

            await jwtAuthMiddleware(
                mockRequest as express.Request,
                mockResponse as express.Response,
                mockNext,
            );

            expect(mockRequest.project).toBeUndefined();
            expect(mockRequest.account).toBeUndefined();
            expect(mockRequest.user).toBeUndefined();
            expect(mockNext).toHaveBeenCalledWith();
        });

        it('should call next() when no embed token provided', async () => {
            await jwtAuthMiddleware(
                mockRequest as express.Request,
                mockResponse as express.Response,
                mockNext,
            );

            expect(mockRequest.project).toEqual({
                projectUuid: mockProjectUuid,
            });
            expect(mockRequest.account).toBeUndefined();
            expect(mockRequest.user).toBeUndefined();
            expect(mockNext).toHaveBeenCalledWith();
        });

        it('should call next() when embed service is not available', async () => {
            mockRequest.headers = { [JWT_HEADER_NAME]: mockEmbedToken };
            mockRequest.services!.getEmbedService = jest
                .fn()
                .mockReturnValue(null);

            await jwtAuthMiddleware(
                mockRequest as express.Request,
                mockResponse as express.Response,
                mockNext,
            );

            expect(mockRequest.project).toEqual({
                projectUuid: mockProjectUuid,
            });
            expect(mockRequest.account).toBeUndefined();
            expect(mockRequest.user).toBeUndefined();
            expect(mockNext).toHaveBeenCalledWith();
        });
    });

    describe('Error handling scenarios', () => {
        it('should return 403 ForbiddenError when token is expired', async () => {
            mockRequest.headers = { [JWT_HEADER_NAME]: mockEmbedToken };

            const forbiddenError = new ForbiddenError(
                'Your embed token has expired.',
            );
            decodeLightdashJwt.mockImplementation(() => {
                throw forbiddenError;
            });

            await jwtAuthMiddleware(
                mockRequest as express.Request,
                mockResponse as express.Response,
                mockNext,
            );

            expect(mockResponse.status).not.toHaveBeenCalled();
            const [error] = mockNext.mock.calls[0];
            expect(error).toBeInstanceOf(ForbiddenError);
            expect(error.message).toBe('Your embed token has expired.');
        });

        it('should return 403 ForbiddenError when token is invalid', async () => {
            mockRequest.headers = { [JWT_HEADER_NAME]: mockEmbedToken };

            decodeLightdashJwt.mockImplementation(() => {
                throw new ForbiddenError('Invalid embed token: malformed');
            });

            await jwtAuthMiddleware(
                mockRequest as express.Request,
                mockResponse as express.Response,
                mockNext,
            );

            expect(mockResponse.status).not.toHaveBeenCalled();
            const [error] = mockNext.mock.calls[0];
            expect(error).toBeInstanceOf(ForbiddenError);
            expect(error.message).toBe('Invalid embed token: malformed');
        });

        it('should pass unexpected errors to next middleware', async () => {
            mockRequest.headers = { [JWT_HEADER_NAME]: mockEmbedToken };

            const unexpectedError = new Error('Database connection failed');
            decodeLightdashJwt.mockImplementation(() => {
                throw unexpectedError;
            });

            await jwtAuthMiddleware(
                mockRequest as express.Request,
                mockResponse as express.Response,
                mockNext,
            );

            expect(mockNext).toHaveBeenCalledWith(unexpectedError);
            expect(mockResponse.status).not.toHaveBeenCalled();
            expect(mockResponse.json).not.toHaveBeenCalled();
        });

        it('should handle embed service errors gracefully', async () => {
            mockRequest.headers = { [JWT_HEADER_NAME]: mockEmbedToken };

            await jwtAuthMiddleware(
                mockRequest as express.Request,
                mockResponse as express.Response,
                mockNext,
            );

            expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
        });
    });

    describe('Path parsing scenarios', () => {
        it.each([
            {
                path: '/api/v1/embed/project-123/dashboard',
                projectUuid: 'project-123',
            },
            {
                path: '/api/v1/projects/project-456/chart',
                projectUuid: 'project-456',
            },
        ])(
            'should extract project UUID from embed path: $path',
            async ({ path, projectUuid }) => {
                mockRequest.path = path;
                mockRequest.query = { embedToken: mockEmbedToken };

                decodeLightdashJwt.mockReturnValue(mockEmbedJwt);

                await jwtAuthMiddleware(
                    mockRequest as express.Request,
                    mockResponse as express.Response,
                    mockNext,
                );

                expect(mockRequest.project).toEqual({ projectUuid });
            },
        );

        it('should handle paths without embed segment', async () => {
            mockRequest.path = '/api/v1/some-other-path';

            await jwtAuthMiddleware(
                mockRequest as express.Request,
                mockResponse as express.Response,
                mockNext,
            );

            expect(mockRequest.project).toBeUndefined();
            expect(mockNext).toHaveBeenCalledWith();
        });

        it('should handle paths where embed is the last segment', async () => {
            mockRequest.path = '/api/v1/embed';

            await jwtAuthMiddleware(
                mockRequest as express.Request,
                mockResponse as express.Response,
                mockNext,
            );

            expect(mockRequest.project).toBeUndefined();
            expect(mockNext).toHaveBeenCalledWith();
        });
    });

    describe('Token extraction', () => {
        it('should use header token', async () => {
            mockRequest.headers = { [JWT_HEADER_NAME]: mockEmbedToken };
            decodeLightdashJwt.mockReturnValue(mockEmbedJwt);

            await jwtAuthMiddleware(
                mockRequest as express.Request,
                mockResponse as express.Response,
                mockNext,
            );

            expect(decodeLightdashJwt).toHaveBeenCalledWith(
                mockEmbedToken,
                mockEncodedSecret,
            );
            expect(mockRequest.account!.authentication.source).toBe(
                mockEmbedToken,
            );
        });
    });
});
