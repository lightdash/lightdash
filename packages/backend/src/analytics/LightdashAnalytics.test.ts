import Analytics from '@rudderstack/rudder-sdk-node';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import Logger from '../logging/logger';
import type { FeatureFlagCheckAggregateEntry } from '../models/FeatureFlagModel/flagCheckAggregator';
import { LightdashAnalytics } from './LightdashAnalytics';

// writeKey drives the tracking-enabled check inside flushEvents()
const buildAnalytics = (writeKey: string) =>
    new LightdashAnalytics({
        lightdashConfig: {
            ...lightdashConfigMock,
            rudder: { writeKey, dataPlaneUrl: 'notrack' },
        },
        writeKey: writeKey || 'notrack',
        dataPlaneUrl: 'notrack',
        options: { enable: false },
    });

const queueOf = (analytics: LightdashAnalytics, size: number) => {
    const internal = analytics as unknown as { queue: unknown[] };
    internal.queue = new Array(size).fill({});
    return internal;
};

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

    describe('flushEvents', () => {
        it('keeps flushing until the queue drains', async () => {
            // flush() only sends `flushAt` (20) events per call, so a single
            // call would silently strand everything past the first batch.
            const analytics = buildAnalytics('a-write-key');
            const internal = queueOf(analytics, 45);
            const flushSpy = vi
                .spyOn(analytics, 'flush')
                .mockImplementation(async () => {
                    internal.queue.splice(0, 20);
                });

            await analytics.flushEvents();

            // 3 to drain 45 in batches of 20, then 1 to await work already
            // in flight from track()'s own auto-flush.
            expect(flushSpy).toHaveBeenCalledTimes(4);
            expect(internal.queue).toHaveLength(0);
        });

        it('awaits in-flight requests when the queue is already empty', async () => {
            // The failure this guards: track() auto-flushed everything, so the
            // queue reads empty while the POST is still outstanding.
            const analytics = buildAnalytics('a-write-key');
            queueOf(analytics, 0);
            let settled = false;
            const flushSpy = vi
                .spyOn(analytics, 'flush')
                .mockImplementation(async () => {
                    await new Promise((resolve) => {
                        setTimeout(resolve, 10);
                    });
                    settled = true;
                });

            await analytics.flushEvents();

            expect(flushSpy).toHaveBeenCalled();
            expect(settled).toBe(true);
        });

        it('does not flush when tracking is disabled', async () => {
            const analytics = buildAnalytics('');
            const flushSpy = vi.spyOn(analytics, 'flush');

            await analytics.flushEvents();

            expect(flushSpy).not.toHaveBeenCalled();
        });

        it('stops at the deadline when the queue never drains', async () => {
            const analytics = buildAnalytics('a-write-key');
            queueOf(analytics, 10);
            const flushSpy = vi
                .spyOn(analytics, 'flush')
                .mockResolvedValue(undefined);

            await analytics.flushEvents(0);

            // Bounded by the deadline: one loop pass, plus the final
            // in-flight flush. It must not spin on the undrained queue.
            expect(flushSpy).toHaveBeenCalledTimes(2);
        });

        it('does not throw when flushing fails', async () => {
            const warnSpy = vi
                .spyOn(Logger, 'warn')
                .mockImplementation(() => Logger);
            const analytics = buildAnalytics('a-write-key');
            queueOf(analytics, 5);
            vi.spyOn(analytics, 'flush').mockRejectedValue(
                new Error('data plane unreachable'),
            );

            await expect(analytics.flushEvents()).resolves.toBeUndefined();
            expect(warnSpy).toHaveBeenCalled();
            warnSpy.mockRestore();
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
