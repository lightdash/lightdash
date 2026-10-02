import { describe, expect, it } from 'vitest';
import { shouldOpenPersonalSignInModal } from './shouldOpenPersonalSignInModal';

const decision = (
    overrides: Partial<
        Parameters<typeof shouldOpenPersonalSignInModal>[0]
    > = {},
) =>
    shouldOpenPersonalSignInModal({
        errorName: 'BigqueryTokenError',
        personalSignInExpired: true,
        requireUserCredentials: false,
        warehouseType: 'bigquery',
        alreadyOpened: false,
        pending: false,
        ...overrides,
    });

describe('personal sign-in modal decision', () => {
    it('opens for a personal expiry in optional and required policies', () => {
        expect(decision()).toBe(true);
        expect(decision({ requireUserCredentials: true })).toBe(true);
    });

    it('does not open optional missing credentials or permission failures', () => {
        expect(
            decision({
                errorName: 'MissingWarehouseCredentialsError',
                personalSignInExpired: false,
            }),
        ).toBe(false);
        expect(decision({ errorName: 'ForbiddenError' })).toBe(false);
        expect(
            decision({
                errorName: 'BigqueryTokenError',
                personalSignInExpired: false,
            }),
        ).toBe(false);
    });

    it('opens missing credentials only when required', () => {
        expect(
            decision({
                errorName: 'MissingWarehouseCredentialsError',
                personalSignInExpired: false,
                requireUserCredentials: true,
            }),
        ).toBe(true);
    });

    it('does not repeat after opening, cancellation, or while pending', () => {
        expect(decision({ alreadyOpened: true })).toBe(false);
        expect(decision({ pending: true })).toBe(false);
    });
});
