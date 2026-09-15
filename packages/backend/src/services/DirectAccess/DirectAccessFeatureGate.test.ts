import { ForbiddenError } from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { DirectAccessFeatureGate } from './DirectAccessFeatureGate';

const account = {
    organization: { organizationUuid: 'organization-uuid' },
    user: { userUuid: 'user-uuid' },
} as Parameters<DirectAccessFeatureGate['isEnabled']>[0];

const buildGate = (valid: boolean, hasLicenseKey = true) => {
    const getLicenseStatus = vi.fn(() => ({ hasLicenseKey, valid }));
    return {
        gate: new DirectAccessFeatureGate({ getLicenseStatus }),
        getLicenseStatus,
    };
};

describe('DirectAccessFeatureGate', () => {
    it('enables direct access with a valid license without a feature flag', async () => {
        const { gate } = buildGate(true);
        await expect(gate.isEnabled(account)).resolves.toBe(true);
        await expect(gate.assertEnabled(account)).resolves.toBeUndefined();
    });

    it.each([true, false])(
        'denies an invalid license (key present: %s)',
        async (hasLicenseKey) => {
            const { gate } = buildGate(false, hasLicenseKey);
            await expect(gate.isEnabled(account)).resolves.toBe(false);
            await expect(gate.assertEnabled(account)).rejects.toThrow(
                ForbiddenError,
            );
        },
    );

    it('denies users without organization context', async () => {
        const { gate } = buildGate(true);
        await expect(
            gate.isEnabledForUser({
                userUuid: 'user-uuid',
                organizationUuid: undefined,
            }),
        ).resolves.toBe(false);
    });

    it('uses the current license status on every check', async () => {
        const { gate, getLicenseStatus } = buildGate(true);
        await expect(gate.isEnabled(account)).resolves.toBe(true);
        getLicenseStatus.mockReturnValue({ hasLicenseKey: true, valid: false });
        await expect(gate.isEnabled(account)).resolves.toBe(false);
        getLicenseStatus.mockReturnValue({ hasLicenseKey: true, valid: true });
        await expect(gate.isEnabled(account)).resolves.toBe(true);
    });
});
