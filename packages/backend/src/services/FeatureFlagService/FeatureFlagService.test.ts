import { FeatureFlags } from './FeatureFlags';
import { FeatureFlagService } from './FeatureFlagService';
import { user } from './FeatureFlagService.mock';

describe('FeatureFlagService', () => {
    test('Returns a value indicating if a feature flag is enabled based on mockFn', async () => {
        const svc = new FeatureFlagService({
            mockFn: ({ flag }) => flag !== FeatureFlags._Test_,
        });

        expect(
            await svc.isFeatureFlagEnabled({
                user,
                flag: FeatureFlags.UseDbtLs,
            }),
        ).toStrictEqual(true);

        expect(
            await svc.isFeatureFlagEnabled({
                user,
                flag: FeatureFlags._Test_,
            }),
        ).toStrictEqual(false);
    });

    test('Supports using a static convenience method instead', async () => {
        const mockFn = ({ flag }: { flag: FeatureFlags }) =>
            flag !== FeatureFlags._Test_;

        expect(
            await FeatureFlagService.isFeatureFlagEnabled(
                {
                    user,
                    flag: FeatureFlags.UseDbtLs,
                },
                { mockFn },
            ),
        ).toStrictEqual(true);

        expect(
            await FeatureFlagService.isFeatureFlagEnabled(
                {
                    user,
                    flag: FeatureFlags._Test_,
                },
                { mockFn },
            ),
        ).toStrictEqual(false);
    });
});
