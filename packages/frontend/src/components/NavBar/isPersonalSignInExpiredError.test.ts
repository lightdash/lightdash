import {
    getPersonalSignInExpiredMessage,
    WarehouseTypes,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { isPersonalSignInExpiredError } from './isPersonalSignInExpiredError';

describe('isPersonalSignInExpiredError', () => {
    const message = `${getPersonalSignInExpiredMessage(WarehouseTypes.BIGQUERY)}\n\ninvalid_grant`;

    it('recognises the async query error data flag', () => {
        expect(
            isPersonalSignInExpiredError({
                error: { message: 'x', data: { personalSignInExpired: true } },
            }),
        ).toBe(true);
    });

    it('recognises the personal expiry message on an API error or an Error', () => {
        expect(isPersonalSignInExpiredError({ error: { message } })).toBe(true);
        expect(isPersonalSignInExpiredError(new Error(message))).toBe(true);
    });

    it('ignores shared sign-in and other errors', () => {
        expect(
            isPersonalSignInExpiredError({
                error: {
                    message:
                        "This project's connection uses a Google sign-in that has expired.",
                },
            }),
        ).toBe(false);
        expect(isPersonalSignInExpiredError(null)).toBe(false);
        expect(isPersonalSignInExpiredError('boom')).toBe(false);
    });
});
