import { FeatureFlags } from '@lightdash/common';
import { areOrganizationGroupsAvailable } from './groupsAvailable';

test.each([true, false])(
    'groups need a valid licence (valid %s)',
    async (valid) => {
        const featureFlagModel = {
            get: vi.fn().mockResolvedValue({ enabled: true }),
        };
        expect(
            await areOrganizationGroupsAvailable({
                organizationUuid: 'org',
                isLicensed: () => valid,
                featureFlagModel,
            }),
        ).toBe(valid);
        if (valid)
            expect(featureFlagModel.get).toHaveBeenCalledExactlyOnceWith({
                user: { organizationUuid: 'org' },
                featureFlagId: FeatureFlags.UserGroupsEnabled,
            });
        else expect(featureFlagModel.get).not.toHaveBeenCalled();
    },
);

test('groups need the organization flag and propagate resolver failures', async () => {
    const featureFlagModel = {
        get: vi.fn().mockResolvedValue({ enabled: false }),
    };
    const args = {
        organizationUuid: 'org',
        isLicensed: () => true,
        featureFlagModel,
    };
    expect(await areOrganizationGroupsAvailable(args)).toBe(false);
    featureFlagModel.get.mockRejectedValue(new Error('flags unavailable'));
    await expect(areOrganizationGroupsAvailable(args)).rejects.toThrow(
        'flags unavailable',
    );
});
