import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import type { FeatureFlagCheckAggregateEntry } from '../models/FeatureFlagModel/flagCheckAggregator';
import { LightdashAnalytics } from './LightdashAnalytics';

describe('LightdashAnalytics', () => {
    it('tracks one aggregated feature flag check event per entry', () => {
        const analytics = new LightdashAnalytics({
            lightdashConfig: lightdashConfigMock,
            writeKey: 'notrack',
            dataPlaneUrl: 'notrack',
            options: { enable: false },
        });
        const trackSpy = vi.spyOn(analytics, 'track');
        const entries: FeatureFlagCheckAggregateEntry[] = [
            {
                flagId: 'enabled-flag',
                checkCount: 3,
                enabledCount: 2,
                disabledCount: 1,
                uniqueOrgCount: 2,
                orgUuids: ['org-1', 'org-2'],
                orgUuidsTruncated: false,
                windowStartAt: '2026-07-25T00:00:00.000Z',
                windowEndAt: '2026-07-25T00:15:00.000Z',
            },
            {
                flagId: 'disabled-flag',
                checkCount: 1,
                enabledCount: 0,
                disabledCount: 1,
                uniqueOrgCount: 1,
                orgUuids: ['org-3'],
                orgUuidsTruncated: true,
                windowStartAt: '2026-07-25T00:00:00.000Z',
                windowEndAt: '2026-07-25T00:15:00.000Z',
            },
        ];

        analytics.trackFeatureFlagChecks(entries, 'scheduler');

        expect(trackSpy).toHaveBeenCalledTimes(2);
        expect(trackSpy).toHaveBeenNthCalledWith(1, {
            event: 'feature_flag.checked_aggregated',
            properties: {
                ...entries[0],
                processType: 'scheduler',
            },
        });
        expect(trackSpy).toHaveBeenNthCalledWith(2, {
            event: 'feature_flag.checked_aggregated',
            properties: {
                ...entries[1],
                processType: 'scheduler',
            },
        });
    });
});
