import {
    LightdashAppUuidHeader,
    LightdashRequestMethodHeader,
    QueryExecutionContext,
    RequestMethod,
    SchedulerFormat,
    type Account,
} from '@lightdash/common';
import Analytics from '@rudderstack/rudder-sdk-node';
import { EventEmitter } from 'events';
import ExecutionContext from 'node-execution-context';
import type { MockInstance } from 'vitest';
import { buildAccount } from '../auth/account/account.mock';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import Logger from '../logging/logger';
import type { FeatureFlagCheckAggregateEntry } from '../models/FeatureFlagModel/flagCheckAggregator';
import { EventStreamSink } from './eventStream/EventStreamSink';
import { eventStreamRegistry } from './eventStream/registry';
import { getContextFromHeader, LightdashAnalytics } from './LightdashAnalytics';
import type { QueryCompletedEvent } from './LightdashAnalytics';

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
    it.each([true, false])(
        'keeps query diagnostics in the usage copy only (semantic references=%s)',
        (withSemanticUsage) => {
            const writer = { push: vi.fn(), flush: vi.fn(), close: vi.fn() };
            const eventEmitter = new EventEmitter();
            const metricEvent = vi.fn();
            eventEmitter.on('analytics.track.query.completed', metricEvent);
            const analytics = new LightdashAnalytics({
                lightdashConfig: {
                    ...lightdashConfigMock,
                    rudder: { writeKey: 'test', dataPlaneUrl: 'notrack' },
                    prometheus: {
                        ...lightdashConfigMock.prometheus,
                        enabled: true,
                        eventMetricsEnabled: true,
                    },
                },
                writeKey: 'notrack',
                dataPlaneUrl: 'notrack',
                options: { enable: false },
                eventEmitter,
                eventStreamSink: new EventStreamSink(
                    eventStreamRegistry,
                    writer,
                ),
            });
            const payload = {
                event: 'query.completed',
                ...(withSemanticUsage
                    ? { anonymousId: 'embed' }
                    : { userId: 'user' }),
                properties: {
                    organizationId: 'org',
                    projectId: 'project',
                    isPreviewProject: false,
                    status: 'error',
                    errorMessage: 'column "private_field" does not exist',
                    ...(withSemanticUsage
                        ? {
                              embeddedUsage: {
                                  externalUserId: 'viewer',
                                  tenantAttribute: 'brand',
                                  tenantId: 'brand-a',
                                  tokenFingerprint: null,
                              },
                          }
                        : {}),
                    ...(withSemanticUsage
                        ? {
                              semanticUsage: {
                                  status: 'captured',
                                  references: [{ fieldId: 'private_field' }],
                              },
                          }
                        : {}),
                },
            } as QueryCompletedEvent;
            const track = vi
                .spyOn(Analytics.prototype, 'track')
                .mockImplementation(() => {});
            try {
                analytics.track(payload);
                expect(writer.push).toHaveBeenCalledTimes(1);
                expect(writer.push).toHaveBeenCalledWith(
                    'query_events',
                    expect.objectContaining({
                        error: payload.properties.errorMessage,
                        user_id: withSemanticUsage ? null : 'user',
                        external_user_id: withSemanticUsage ? 'viewer' : null,
                        embed_tenant_id: withSemanticUsage ? 'brand-a' : null,
                        semantic_lineage_status: withSemanticUsage
                            ? 'captured'
                            : null,
                        semantic_field_references: withSemanticUsage
                            ? '[{"fieldId":"private_field"}]'
                            : null,
                    }),
                );
                expect(track).toHaveBeenCalledTimes(1);
                expect(track.mock.calls[0][0].properties).not.toHaveProperty(
                    'embeddedUsage',
                );
                expect(
                    metricEvent.mock.calls[0][0].properties,
                ).not.toHaveProperty('embeddedUsage');
                expect(track.mock.calls[0][0].properties).not.toHaveProperty(
                    'semanticUsage',
                );
                expect(
                    metricEvent.mock.calls[0][0].properties,
                ).not.toHaveProperty('semanticUsage');
                expect(track.mock.calls[0][0].properties).not.toHaveProperty(
                    'errorMessage',
                );
                expect(
                    metricEvent.mock.calls[0][0].properties,
                ).not.toHaveProperty('errorMessage');
                expect(payload.properties.errorMessage).toBe(
                    'column "private_field" does not exist',
                );
                expect(Boolean(payload.properties.semanticUsage)).toBe(
                    withSemanticUsage,
                );
            } finally {
                track.mockRestore();
            }
        },
    );

    it('attributes CSV exports to the verified embed viewer only in usage storage', () => {
        const writer = { push: vi.fn(), flush: vi.fn(), close: vi.fn() };
        const eventEmitter = new EventEmitter();
        const event = 'download_results.completed';
        const metricEvent = vi.fn();
        eventEmitter.on(`analytics.track.${event}`, metricEvent);
        const analytics = new LightdashAnalytics({
            lightdashConfig: {
                ...lightdashConfigMock,
                rudder: { writeKey: 'test', dataPlaneUrl: 'notrack' },
                usageEvents: {
                    ...lightdashConfigMock.usageEvents,
                    enabled: true,
                },
                prometheus: {
                    ...lightdashConfigMock.prometheus,
                    enabled: true,
                    eventMetricsEnabled: true,
                },
            },
            writeKey: 'notrack',
            dataPlaneUrl: 'notrack',
            options: { enable: false },
            eventEmitter,
            eventStreamSink: new EventStreamSink(eventStreamRegistry, writer),
        });
        const embed = buildAccount({ accountType: 'jwt' });
        const account = {
            ...embed,
            authentication: {
                ...embed.authentication,
                data: {
                    ...embed.authentication.data,
                    user: { externalId: 'viewer' },
                    userAttributes: { brand: 'brand-a', email: 'private' },
                    usageAnalytics: { tenantAttribute: 'brand' },
                },
            },
        };
        const track = vi
            .spyOn(Analytics.prototype, 'track')
            .mockImplementation(() => {});
        try {
            analytics.trackAccount(account, {
                event,
                userId: account.user.id,
                properties: {
                    projectId: 'project',
                    fileType: SchedulerFormat.CSV,
                },
            });
            expect(writer.push).toHaveBeenCalledExactlyOnceWith(
                'export_events',
                expect.objectContaining({
                    org_id: embed.organization.organizationUuid,
                    user_id: null,
                    query_id: null,
                    external_user_id: 'viewer',
                    embed_tenant_id: 'brand-a',
                    embed_tenant_attribute: 'brand',
                }),
            );
            expect(JSON.stringify(writer.push.mock.calls)).not.toContain(
                'private',
            );
            expect(track).toHaveBeenCalledOnce();
            expect(metricEvent).toHaveBeenCalledOnce();
            for (const mock of [track, metricEvent]) {
                expect(mock.mock.calls[0][0].properties).not.toHaveProperty(
                    'embeddedUsage',
                );
            }
        } finally {
            track.mockRestore();
        }
    });

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

    it('keeps the embedded viewer id out of Rudderstack', () => {
        const analytics = buildAnalytics('write-key');
        const rudderstackTrack = vi
            .spyOn(Analytics.prototype, 'track')
            .mockImplementation(() => analytics);

        analytics.track({
            event: 'ai.usage',
            userId: 'embed-actor',
            properties: {
                eventId: 'evt-1',
                outcome: 'complete',
                feature: 'agent',
                functionId: 'streamAgentResponse',
                organizationId: 'org-1',
                projectId: 'project-1',
                aiAgentId: 'agent-1',
                threadId: 'thread-1',
                promptId: 'prompt-1',
                dataAppId: null,
                model: 'claude-sonnet-5',
                provider: 'anthropic',
                keyManagement: 'lightdash-managed',
                channel: 'embed',
                externalUserId: 'viewer@customer.example',
                managedAgentRunId: null,
                deepResearchRunId: null,
                deepResearchPhase: null,
                inputTokens: 10,
                outputTokens: 5,
                cacheReadTokens: null,
                cacheWriteTokens: null,
                reasoningTokens: null,
                totalTokens: 15,
            },
        });

        expect(rudderstackTrack).toHaveBeenCalledTimes(1);
        const [sent] = rudderstackTrack.mock.calls[0];
        expect(sent.properties).toMatchObject({
            channel: 'embed',
            totalTokens: 15,
        });
        expect(JSON.stringify(sent)).not.toContain('viewer@customer.example');
        rudderstackTrack.mockRestore();
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

    describe('actor fallback', () => {
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

        let superTrackSpy: MockInstance<Analytics['track']>;

        beforeEach(() => {
            superTrackSpy = vi
                .spyOn(Analytics.prototype, 'track')
                .mockImplementation(() => {});
        });

        afterEach(() => {
            superTrackSpy.mockRestore();
        });

        it('sends an event with no actor under the instance anonymous id', () => {
            const warn = vi
                .spyOn(Logger, 'warn')
                .mockImplementation(() => Logger);

            analytics.track({
                event: 'content_as_code.pulled_from_git',
                properties: {
                    projectId: 'project-uuid',
                    chartsCount: 1,
                    dashboardsCount: 0,
                    failureCount: 0,
                },
            } as never);

            expect(superTrackSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    anonymousId: LightdashAnalytics.anonymousId,
                }),
            );
            expect(warn).toHaveBeenCalledTimes(1);
            warn.mockRestore();
        });

        it('says which client made the request, and nothing outside one', () => {
            const event = {
                event: 'content_as_code.pulled_from_git' as const,
                userId: 'user-uuid',
                properties: {
                    projectId: 'project-uuid',
                    chartsCount: 1,
                    dashboardsCount: 0,
                    failureCount: 0,
                },
            };

            ExecutionContext.run(() => analytics.track(event), {
                request_method: RequestMethod.DESKTOP,
            });
            analytics.track(event);

            const contexts = superTrackSpy.mock.calls.map(
                ([message]) => message.context?.requestMethod,
            );
            expect(contexts).toEqual([RequestMethod.DESKTOP, undefined]);
        });

        it('leaves an event with a userId untouched', () => {
            analytics.track({
                event: 'content_as_code.pulled_from_git',
                userId: 'user-uuid',
                properties: {
                    projectId: 'project-uuid',
                    chartsCount: 1,
                    dashboardsCount: 0,
                    failureCount: 0,
                },
            });

            expect(superTrackSpy).toHaveBeenCalledWith(
                expect.objectContaining({ userId: 'user-uuid' }),
            );
            expect(superTrackSpy).toHaveBeenCalledWith(
                expect.not.objectContaining({ anonymousId: expect.anything() }),
            );
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

        let superTrackSpy: MockInstance<Analytics['track']>;

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

describe('getContextFromHeader', () => {
    it.each([
        [undefined, 'app-uuid', QueryExecutionContext.DATA_APP],
        [undefined, undefined, QueryExecutionContext.API],
        [RequestMethod.CLI, 'app-uuid', QueryExecutionContext.CLI],
        [RequestMethod.WEB_APP, 'app-uuid', undefined],
    ])(
        'maps request method %s with app header %s to %s',
        (method, appUuid, expected) => {
            const headers: Record<string, string | undefined> = {
                [LightdashRequestMethodHeader]: method,
                [LightdashAppUuidHeader]: appUuid,
            };
            const req = {
                header: (name: string) => headers[name],
            } as unknown as Parameters<typeof getContextFromHeader>[0];

            expect(getContextFromHeader(req)).toBe(expected);
        },
    );
});
