import express from 'express';
import {
    buildAccount,
    defaultSessionUser,
} from '../../auth/account/account.mock';
import { sessionAccountMiddleware } from './sessionAccountMiddleware';

describe('sessionAccountMiddleware', () => {
    const defaultRequest = {
        headers: {},
    } as express.Request;
    const mockResponse = {} as express.Response;
    const mockNext = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('when req.user is not present', () => {
        it('should not attach an account and call next()', () => {
            const request = defaultRequest;
            sessionAccountMiddleware(request, mockResponse, mockNext);

            expect(request.account).toBeUndefined();
            expect(mockNext).toHaveBeenCalledWith();
        });
    });

    describe('when req.account is already present', () => {
        it('should preserve the existing account and call next()', () => {
            const existingAccount = buildAccount({ accountType: 'session' });

            const request = {
                ...defaultRequest,
                user: defaultSessionUser,
                account: existingAccount,
            } as express.Request;

            sessionAccountMiddleware(request, mockResponse, mockNext);

            expect(request.account).toBe(existingAccount);
            expect(mockNext).toHaveBeenCalledWith();
        });
    });

    describe('when req.user is present and req.account is not', () => {
        it('should attach an account to the request and call next()', () => {
            const request = {
                ...defaultRequest,
                user: defaultSessionUser,
            } as express.Request;

            sessionAccountMiddleware(request, mockResponse, mockNext);

            expect(request.account).toBeDefined();
            expect(mockNext).toHaveBeenCalledWith();
        });
    });
});
