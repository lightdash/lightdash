import { LightdashMode } from '@lightdash/common';
import {
    EMAIL_ONE_TIME_PASSCODE_EXPIRY_SECONDS,
    EMAIL_ONE_TIME_PASSCODE_MAX_ATTEMPTS,
    EMAIL_ONE_TIME_PASSCODE_RESEND_COOLDOWN_SECONDS,
    generateOneTimePasscode,
    isOtpExpired,
    isOtpMaxAttempts,
    otpExpirationDate,
    resendCooldownRemainingSeconds,
} from './oneTimePasscode';

describe('oneTimePasscode', () => {
    describe('generateOneTimePasscode', () => {
        it('returns 000000 in DEV and PR modes', () => {
            expect(generateOneTimePasscode(LightdashMode.DEV)).toBe('000000');
            expect(generateOneTimePasscode(LightdashMode.PR)).toBe('000000');
        });

        it('returns a zero-padded 6-digit code otherwise', () => {
            const code = generateOneTimePasscode(LightdashMode.DEFAULT);
            expect(code).toMatch(/^\d{6}$/);
        });
    });

    describe('otpExpirationDate', () => {
        it('adds the expiry window to the creation time', () => {
            const createdAt = new Date('2026-01-01T00:00:00.000Z');
            expect(otpExpirationDate(createdAt).getTime()).toBe(
                createdAt.getTime() +
                    EMAIL_ONE_TIME_PASSCODE_EXPIRY_SECONDS * 1000,
            );
        });
    });

    describe('isOtpExpired', () => {
        it('is false for a freshly created passcode', () => {
            expect(isOtpExpired(new Date())).toBe(false);
        });

        it('is true once the expiry window has passed', () => {
            const old = new Date(
                Date.now() -
                    (EMAIL_ONE_TIME_PASSCODE_EXPIRY_SECONDS + 1) * 1000,
            );
            expect(isOtpExpired(old)).toBe(true);
        });
    });

    describe('isOtpMaxAttempts', () => {
        it('locks out at the max attempt count', () => {
            expect(
                isOtpMaxAttempts(EMAIL_ONE_TIME_PASSCODE_MAX_ATTEMPTS - 1),
            ).toBe(false);
            expect(isOtpMaxAttempts(EMAIL_ONE_TIME_PASSCODE_MAX_ATTEMPTS)).toBe(
                true,
            );
        });
    });

    describe('resendCooldownRemainingSeconds', () => {
        it('returns 0 once the cooldown has elapsed', () => {
            const old = new Date(
                Date.now() -
                    (EMAIL_ONE_TIME_PASSCODE_RESEND_COOLDOWN_SECONDS + 1) *
                        1000,
            );
            expect(resendCooldownRemainingSeconds(old)).toBe(0);
        });

        it('returns the remaining seconds for a fresh passcode', () => {
            const remaining = resendCooldownRemainingSeconds(new Date());
            expect(remaining).toBeGreaterThan(0);
            expect(remaining).toBeLessThanOrEqual(
                EMAIL_ONE_TIME_PASSCODE_RESEND_COOLDOWN_SECONDS,
            );
        });
    });
});
