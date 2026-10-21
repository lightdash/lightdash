import { FeatureFlags, ForbiddenError } from '@lightdash/common';
import { assertChartTypesEnabled } from './chartTypeFeatureGate';

const user = { userUuid: 'user-1', organizationUuid: 'org-1' };

const libraryFlag = (enabled: boolean) =>
    vi.fn().mockImplementation(async ({ featureFlagId }) => ({
        id: featureFlagId,
        enabled,
    }));

const flags = (enabled: Partial<Record<FeatureFlags, boolean>>) =>
    vi.fn().mockImplementation(async ({ featureFlagId }) => ({
        id: featureFlagId,
        enabled: enabled[featureFlagId as FeatureFlags] ?? false,
    }));

describe('chart type usage gate', () => {
    it.each([true, false])(
        'allows chart types wherever Chart Studio is available (library=%s)',
        async (library) => {
            const get = libraryFlag(library);
            await expect(
                assertChartTypesEnabled({ get }, true, user),
            ).resolves.toBeUndefined();
            expect(get).not.toHaveBeenCalled();
        },
    );

    it('falls back to the chart type library without Chart Studio or data apps', async () => {
        const get = flags({ [FeatureFlags.ChartTypeRegistry]: true });
        await expect(
            assertChartTypesEnabled({ get }, false, user),
        ).resolves.toBeUndefined();
        expect(get).toHaveBeenNthCalledWith(1, {
            user,
            featureFlagId: FeatureFlags.EnableDataApps,
        });
        expect(get).toHaveBeenNthCalledWith(2, {
            user,
            featureFlagId: FeatureFlags.ChartTypeRegistry,
        });
    });

    it('keeps chart types usable where data apps are on without Chart Studio or the library', async () => {
        const get = flags({ [FeatureFlags.EnableDataApps]: true });
        await expect(
            assertChartTypesEnabled({ get }, false, user),
        ).resolves.toBeUndefined();
    });

    it('refuses without Chart Studio, the library or data apps', async () => {
        const get = flags({});
        await expect(
            assertChartTypesEnabled({ get }, false, user),
        ).rejects.toThrow(new ForbiddenError('Chart types are not enabled'));
    });

    it('propagates library resolver errors when data apps are disabled', async () => {
        const error = new Error('library resolver unavailable');
        const get = vi
            .fn()
            .mockResolvedValueOnce({
                id: FeatureFlags.EnableDataApps,
                enabled: false,
            })
            .mockRejectedValueOnce(error);
        await expect(
            assertChartTypesEnabled({ get }, false, user),
        ).rejects.toBe(error);
    });

    it('does not consult a failing library resolver when data apps are enabled', async () => {
        const error = new Error('library resolver unavailable');
        const get = vi.fn().mockImplementation(async ({ featureFlagId }) => {
            if (featureFlagId === FeatureFlags.ChartTypeRegistry) throw error;
            return { id: featureFlagId, enabled: true };
        });
        await expect(
            assertChartTypesEnabled({ get }, false, user),
        ).resolves.toBeUndefined();
        expect(get).toHaveBeenCalledTimes(1);
    });
});
