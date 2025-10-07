import { ForbiddenError, JWT_HEADER_NAME } from '@lightdash/common';
import express from 'express';
import { buildAccount } from '../../auth/account/account.mock';
import { jwtAuthMiddleware } from './jwtAuthMiddleware';

describe('Embed Auth Middleware', () => {
    let mockRequest: Partial<express.Request>;
    let mockResponse: Partial<express.Response>;
    let mockNext: jest.Mock;

    const mockAccount = buildAccount({ accountType: 'jwt' });
    const mockProjectUuid = mockAccount.embed.projectUuid;
    const mockEmbedToken = mockAccount.authentication.source;

    const mockEmbedService = {
        getAccountFromJwt: jest.fn().mockResolvedValue(mockAccount),
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

            await jwtAuthMiddleware(
                mockRequest as express.Request,
                mockResponse as express.Response,
                mockNext,
            );

            expect(mockEmbedService.getAccountFromJwt).toHaveBeenCalledWith(
                mockProjectUuid,
                mockEmbedToken,
            );
            expect(mockRequest.account).toBeDefined();
            expect(mockRequest.account).toBe(mockAccount);
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
            mockEmbedService.getAccountFromJwt.mockRejectedValueOnce(
                forbiddenError,
            );

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

            mockEmbedService.getAccountFromJwt.mockRejectedValueOnce(
                new ForbiddenError('Invalid embed token: malformed'),
            );

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
            mockEmbedService.getAccountFromJwt.mockRejectedValueOnce(
                unexpectedError,
            );

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
            mockEmbedService.getAccountFromJwt.mockRejectedValueOnce(
                new Error('Service error'),
            );

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

            await jwtAuthMiddleware(
                mockRequest as express.Request,
                mockResponse as express.Response,
                mockNext,
            );

            expect(mockEmbedService.getAccountFromJwt).toHaveBeenCalledWith(
                mockProjectUuid,
                mockEmbedToken,
            );
            expect(mockRequest.account!.authentication.source).toBe(
                mockEmbedToken,
            );
        });
    });
});
