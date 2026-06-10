import { LightdashMode } from '@lightdash/common';
import { randomInt } from 'crypto';

/**
 * Shared one-time passcode (OTP) settings and helpers, reused by primary-email
 * verification (UserService) and domain-ownership verification. A passcode is a
 * 6-digit code, valid for 15 minutes, with at most 5 confirmation attempts.
 */
export const EMAIL_ONE_TIME_PASSCODE_EXPIRY_SECONDS = 60 * 15;
export const EMAIL_ONE_TIME_PASSCODE_MAX_ATTEMPTS = 5;
/**
 * Minimum gap between issuing passcodes for the same challenge. Throttles
 * resends so a fresh code can't be minted on demand — which would otherwise
 * reset the attempt lockout and turn the endpoint into an email-bomb / brute
 * force amplifier.
 */
export const EMAIL_ONE_TIME_PASSCODE_RESEND_COOLDOWN_SECONDS = 30;

/**
 * Generates a 6-digit passcode. In DEV/PR mode it is always `000000` so local
 * and preview environments can verify without a real inbox.
 */
export const generateOneTimePasscode = (mode: LightdashMode): string =>
    mode === LightdashMode.PR || mode === LightdashMode.DEV
        ? '000000'
        : randomInt(999999).toString().padStart(6, '0');

export const otpExpirationDate = (createdAt: Date): Date =>
    new Date(
        createdAt.getTime() + EMAIL_ONE_TIME_PASSCODE_EXPIRY_SECONDS * 1000,
    );

export const isOtpExpired = (createdAt: Date): boolean =>
    otpExpirationDate(createdAt) < new Date();

export const isOtpMaxAttempts = (numberOfAttempts: number): boolean =>
    numberOfAttempts >= EMAIL_ONE_TIME_PASSCODE_MAX_ATTEMPTS;

/**
 * Seconds the caller must still wait before another passcode may be issued for
 * a challenge created at `passcodeCreatedAt`. Returns 0 once the cooldown has
 * elapsed.
 */
export const resendCooldownRemainingSeconds = (
    passcodeCreatedAt: Date,
): number => {
    const elapsedMs = Date.now() - passcodeCreatedAt.getTime();
    const remainingMs =
        EMAIL_ONE_TIME_PASSCODE_RESEND_COOLDOWN_SECONDS * 1000 - elapsedMs;
    return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
};
