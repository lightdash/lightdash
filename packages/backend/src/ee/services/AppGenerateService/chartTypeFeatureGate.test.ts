import { FeatureFlags, ForbiddenError } from '@lightdash/common';
import { assertChartTypesEnabled } from './chartTypeFeatureGate';

const user = { userUuid: 'user-1', organizationUuid: 'org-1' };

describe('chart type flag resolution', () => {
    it.each([
        [false, false],
        [false, true],
        [true, false],
        [true, true],
    ])(
        'checks data apps=%s, library=%s in the supplied context',
        async (dataApps, library) => {
            const get = vi
                .fn()
                .mockImplementation(async ({ featureFlagId }) => ({
                    id: featureFlagId,
                    enabled:
                        featureFlagId === FeatureFlags.EnableDataApps
                            ? dataApps
                            : library,
                }));
            const result = assertChartTypesEnabled({ get }, user);
            if (dataApps || library)
                await expect(result).resolves.toBeUndefined();
            else
                await expect(result).rejects.toThrow(
                    new ForbiddenError('Chart types are not enabled'),
                );
            expect(get).toHaveBeenNthCalledWith(1, {
                user,
                featureFlagId: FeatureFlags.EnableDataApps,
            });
            expect(get).toHaveBeenCalledTimes(dataApps ? 1 : 2);
            if (!dataApps) {
                expect(get).toHaveBeenNthCalledWith(2, {
                    user,
                    featureFlagId: FeatureFlags.ChartTypeRegistry,
                });
            }
        },
    );

    it('propagates data apps resolver errors without checking the library', async () => {
        const error = new Error('resolver unavailable');
        const get = vi.fn().mockRejectedValue(error);
        await expect(assertChartTypesEnabled({ get }, user)).rejects.toBe(
            error,
        );
        expect(get).toHaveBeenCalledTimes(1);
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
        await expect(assertChartTypesEnabled({ get }, user)).rejects.toBe(
            error,
        );
    });

    it('does not consult a failing library resolver when data apps are enabled', async () => {
        const error = new Error('library resolver unavailable');
        const get = vi.fn().mockImplementation(async ({ featureFlagId }) => {
            if (featureFlagId === FeatureFlags.ChartTypeRegistry) throw error;
            return { id: featureFlagId, enabled: true };
        });
        await expect(
            assertChartTypesEnabled({ get }, user),
        ).resolves.toBeUndefined();
        expect(get).toHaveBeenCalledTimes(1);
    });
});
