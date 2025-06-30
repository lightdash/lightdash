import {
    CreateEmbedJwt,
    EmbedJwt,
    ForbiddenError,
    ParameterError,
} from '@lightdash/common';
import jwt from 'jsonwebtoken';
import { lightdashConfig } from '../config/lightdashConfig';
import { EncryptionUtil } from '../utils/EncryptionUtil/EncryptionUtil';
import { decodeLightdashJwt, encodeLightdashJwt } from './lightdashJwt';

// Mock dependencies
jest.mock('@sentry/node', () => ({
    captureException: jest.fn(),
}));

jest.mock('../logging/logger', () => ({
    error: jest.fn(),
}));

describe('JwtUtil', () => {
    const mockJwtData: CreateEmbedJwt = {
        content: {
            type: 'dashboard',
            dashboardUuid: 'test-dashboard-uuid',
            isPreview: false,
            canExportCsv: true,
            canExportImages: true,
            canDateZoom: true,
        },
        userAttributes: {
            externalId: 'test-external-id',
        },
        user: {
            email: 'test@example.com',
            externalId: 'test-external-id',
        },
    };

    let encryptionUtil: EncryptionUtil;
    let encodedSecret: Buffer;

    beforeEach(() => {
        encryptionUtil = new EncryptionUtil({
            lightdashConfig,
        });
        const secret = 'test-secret';
        encodedSecret = encryptionUtil.encrypt(secret);
    });

    describe('encodeJwt', () => {
        it('should encode JWT data into a token', () => {
            const token = encodeLightdashJwt(mockJwtData, encodedSecret, '1h');

            expect(token).toBeDefined();
            expect(typeof token).toBe('string');

            // Verify the token can be decoded
            const secret = encryptionUtil.decrypt(encodedSecret);
            const decoded = jwt.verify(token, secret) as EmbedJwt;

            expect(decoded.content).toEqual(mockJwtData.content);
            expect(decoded.userAttributes).toEqual(mockJwtData.userAttributes);
            expect(decoded.user).toEqual(mockJwtData.user);
        });

        it('should use the provided expiresIn parameter', () => {
            const token = encodeLightdashJwt(mockJwtData, encodedSecret, '2h');

            const secret = encryptionUtil.decrypt(encodedSecret);
            const decoded = jwt.verify(token, secret) as EmbedJwt;

            expect(decoded.exp).toBeDefined();
            expect(typeof decoded.exp).toBe('number');
        });
    });

    describe('decodeJwt', () => {
        it('should decode and validate a valid JWT token', () => {
            const token = encodeLightdashJwt(mockJwtData, encodedSecret, '1h');
            const decoded = decodeLightdashJwt(token, encodedSecret);

            expect(decoded.content).toEqual(mockJwtData.content);
            expect(decoded.userAttributes).toEqual(mockJwtData.userAttributes);
            expect(decoded.user).toEqual(mockJwtData.user);
        });

        it('should throw ForbiddenError for expired tokens', async () => {
            const expiredToken = encodeLightdashJwt(
                mockJwtData,
                encodedSecret,
                '0s',
            );

            // Wait a moment to ensure token is expired
            // eslint-disable-next-line no-promise-executor-return
            await new Promise((resolve) => setTimeout(resolve, 100));

            expect.assertions(2);
            try {
                decodeLightdashJwt(expiredToken, encodedSecret);
                throw new Error('Expected ForbiddenError');
            } catch (e) {
                expect(e).toBeInstanceOf(ForbiddenError);
                expect((e as ForbiddenError).message).toBe(
                    'Your embed token has expired.',
                );
            }
        });

        it('should throw ParameterError for invalid tokens', () => {
            const invalidToken = 'invalid.token.here';

            expect(() => {
                decodeLightdashJwt(invalidToken, encodedSecret);
            }).toThrow(ParameterError);
        });

        it('should handle tokens with dashboard slug content', () => {
            const slugJwtData: CreateEmbedJwt = {
                content: {
                    type: 'dashboard',
                    dashboardSlug: 'test-dashboard-slug',
                    isPreview: false,
                    canExportCsv: true,
                },
                userAttributes: {
                    externalId: 'test-external-id',
                },
            };

            const token = encodeLightdashJwt(slugJwtData, encodedSecret, '1h');
            const decoded = decodeLightdashJwt(token, encodedSecret);

            expect(decoded.content.type).toBe('dashboard');
            expect('dashboardSlug' in decoded.content).toBe(true);
            if ('dashboardSlug' in decoded.content) {
                expect(decoded.content.dashboardSlug).toBe(
                    'test-dashboard-slug',
                );
            }
        });

        it('should handle tokens with missing optional fields', () => {
            const minimalJwtData: CreateEmbedJwt = {
                content: {
                    type: 'dashboard',
                    dashboardUuid: 'test-dashboard-uuid',
                },
            };

            const token = encodeLightdashJwt(
                minimalJwtData,
                encodedSecret,
                '1h',
            );
            const decoded = decodeLightdashJwt(token, encodedSecret);

            expect(decoded.content.type).toBe('dashboard');
            expect('dashboardUuid' in decoded.content).toBe(true);
            if ('dashboardUuid' in decoded.content) {
                expect(decoded.content.dashboardUuid).toBe(
                    'test-dashboard-uuid',
                );
            }
            expect(decoded.userAttributes).toBeUndefined();
            expect(decoded.user).toBeUndefined();
        });

        it('should handle malformed encoded secret', () => {
            const token = encodeLightdashJwt(mockJwtData, encodedSecret, '1h');
            const malformedSecret = 'malformed-secret';

            expect(() => {
                decodeLightdashJwt(token, malformedSecret);
            }).toThrow();
        });
    });

    describe('error handling', () => {
        it('should handle invalid JWT structure gracefully', () => {
            const secret = encryptionUtil.decrypt(encodedSecret);
            const invalidPayload = { invalid: 'payload' };
            const invalidToken = jwt.sign(invalidPayload, secret, {
                expiresIn: '1h',
            });

            expect(() => {
                decodeLightdashJwt(invalidToken, encodedSecret);
            }).toThrow(ParameterError);
        });

        it('should handle tokens with missing required fields', () => {
            const secret = encryptionUtil.decrypt(encodedSecret);
            const incompletePayload = {
                content: {
                    type: 'dashboard',
                    // Missing dashboardUuid or dashboardSlug
                },
            };
            const incompleteToken = jwt.sign(incompletePayload, secret, {
                expiresIn: '1h',
            });

            expect(() => {
                decodeLightdashJwt(incompleteToken, encodedSecret);
            }).toThrow(ParameterError);
        });
    });
});
