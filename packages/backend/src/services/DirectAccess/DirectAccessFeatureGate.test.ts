import { CommercialFeatureFlags } from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { type LicenseService } from '../LicenseService/LicenseService';
import { DirectAccessFeatureGate } from './DirectAccessFeatureGate';

const account = {
    organization: { organizationUuid: 'organization-uuid' },
    user: {
        userUuid: 'user-uuid',
    },
} as unknown as Parameters<DirectAccessFeatureGate['isEnabled']>[0];

const buildGate = ({
    licensed,
    flagResult,
}: {
    licensed: boolean;
    flagResult: boolean | Error;
}) => {
    const get =
        flagResult instanceof Error
            ? vi.fn().mockRejectedValue(flagResult)
            : vi.fn().mockResolvedValue({
                  id: CommercialFeatureFlags.DirectAccess,
                  enabled: flagResult,
              });
    return {
        gate: new DirectAccessFeatureGate(
            { get } as unknown as FeatureFlagModel,
            {
                getLicenseStatus: () => ({
                    hasLicenseKey: licensed,
                    valid: licensed,
                }),
            } as LicenseService,
        ),
        get,
    };
};

describe('DirectAccessFeatureGate', () => {
    it('requires both a valid EE license and the single direct-access flag', async () => {
        const enabled = buildGate({ licensed: true, flagResult: true });
        await expect(enabled.gate.isEnabled(account)).resolves.toBe(true);
        await expect(
            enabled.gate.assertEnabled(account),
        ).resolves.toBeUndefined();
        expect(enabled.get).toHaveBeenCalledWith({
            featureFlagId: CommercialFeatureFlags.DirectAccess,
            user: {
                userUuid: 'user-uuid',
                organizationUuid: 'organization-uuid',
            },
        });
        await expect(
            buildGate({ licensed: true, flagResult: false }).gate.isEnabled(
                account,
            ),
        ).resolves.toBe(false);
    });

    it('short-circuits before flag resolution while unlicensed', async () => {
        const { gate, get } = buildGate({
            licensed: false,
            flagResult: true,
        });
        await expect(gate.isEnabled(account)).resolves.toBe(false);
        expect(get).not.toHaveBeenCalled();
    });

    it('fails closed when flag resolution is unknown', async () => {
        const { gate, get } = buildGate({
            licensed: true,
            flagResult: new Error('flag unavailable'),
        });
        await expect(gate.isEnabled(account)).resolves.toBe(false);
        await expect(gate.assertEnabled(account)).rejects.toMatchObject({
            name: 'ForbiddenError',
        });
        // Failures are never cached — each call retries flag resolution.
        expect(get).toHaveBeenCalledTimes(2);
    });

    it('resolves the flag once per user within the cache TTL', async () => {
        const { gate, get } = buildGate({ licensed: true, flagResult: true });
        await expect(
            Promise.all([gate.isEnabled(account), gate.isEnabled(account)]),
        ).resolves.toEqual([true, true]);
        await expect(gate.isEnabled(account)).resolves.toBe(true);
        expect(get).toHaveBeenCalledTimes(1);

        await gate.isEnabledForUser({
            userUuid: 'other-user-uuid',
            organizationUuid: 'organization-uuid',
        });
        expect(get).toHaveBeenCalledTimes(2);
    });

    it('re-resolves the flag after the cache TTL expires', async () => {
        vi.useFakeTimers();
        try {
            const { gate, get } = buildGate({
                licensed: true,
                flagResult: true,
            });
            await expect(gate.isEnabled(account)).resolves.toBe(true);
            vi.advanceTimersByTime(31_000);
            await expect(gate.isEnabled(account)).resolves.toBe(true);
            expect(get).toHaveBeenCalledTimes(2);
        } finally {
            vi.useRealTimers();
        }
    });
});
