import { PersonSignInProvider, WarehouseTypes } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { shouldShowWarehouseSignInBanner } from './warehouseSignInBannerDecision';

describe('warehouse sign-in banner decision', () => {
    it('shows only for an expired personal sign-in', () => {
        expect(shouldShowWarehouseSignInBanner(undefined)).toBe(false);
        expect(shouldShowWarehouseSignInBanner({ signIn: null })).toBe(false);
        const signIn = {
            provider: PersonSignInProvider.GOOGLE,
            warehouseType: WarehouseTypes.BIGQUERY,
            userWarehouseCredentialsUuid: 'credential-a',
            expired: false,
        };
        expect(shouldShowWarehouseSignInBanner({ signIn })).toBe(false);
        expect(
            shouldShowWarehouseSignInBanner({
                signIn: { ...signIn, expired: true },
            }),
        ).toBe(true);
    });
});
