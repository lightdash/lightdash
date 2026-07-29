import Analytics from '@rudderstack/rudder-sdk-node';
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
            anonymousId: LightdashAnalytics.anonymousId,
            properties: {
                ...entries[0],
                processType: 'scheduler',
            },
        });
        expect(trackSpy).toHaveBeenNthCalledWith(2, {
            event: 'feature_flag.checked_aggregated',
            anonymousId: LightdashAnalytics.anonymousId,
            properties: {
                ...entries[1],
                processType: 'scheduler',
            },
        });
    });

    describe('user.deleted anonymization', () => {
        const analytics = new LightdashAnalytics({
            lightdashConfig: {
                ...lightdashConfigMock,
                rudder: {
                    writeKey: 'test-write-key',
                    dataPlaneUrl: 'http://localhost',
                },
            },
            writeKey: 'test-write-key',
            dataPlaneUrl: 'http://localhost',
            options: { enable: false },
        });

        const deletedUserProperties = {
            context: 'delete_self',
            firstName: 'Jane',
            lastName: 'Doe',
            email: 'jane.doe@example.com',
            organizationId: 'org-uuid',
            deletedUserId: 'deleted-user-uuid',
        };

        let superTrackSpy: ReturnType<typeof vi.spyOn>;

        beforeEach(() => {
            superTrackSpy = vi
                .spyOn(Analytics.prototype, 'track')
                .mockImplementation(() => {});
        });

        afterEach(() => {
            superTrackSpy.mockRestore();
        });

        it('strips PII when the deleted user opted into anonymized tracking', () => {
            analytics.track({
                event: 'user.deleted',
                userId: 'actor-uuid',
                properties: {
                    ...deletedUserProperties,
                    isTrackingAnonymized: true,
                },
            });

            expect(superTrackSpy).toHaveBeenCalledTimes(1);
            expect(superTrackSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    event: 'lightdash_server.user.deleted',
                    properties: {
                        context: 'delete_self',
                        organizationId: 'org-uuid',
                        deletedUserId: 'deleted-user-uuid',
                        is_tracking_anonymized: true,
                    },
                }),
            );
        });

        it('keeps PII when the deleted user did not opt into anonymized tracking', () => {
            analytics.track({
                event: 'user.deleted',
                userId: 'actor-uuid',
                properties: {
                    ...deletedUserProperties,
                    isTrackingAnonymized: false,
                },
            });

            expect(superTrackSpy).toHaveBeenCalledTimes(1);
            expect(superTrackSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    event: 'lightdash_server.user.deleted',
                    properties: {
                        context: 'delete_self',
                        organizationId: 'org-uuid',
                        deletedUserId: 'deleted-user-uuid',
                        is_tracking_anonymized: false,
                        firstName: 'Jane',
                        lastName: 'Doe',
                        email: 'jane.doe@example.com',
                    },
                }),
            );
        });
    });
});
