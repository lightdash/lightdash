import Analytics from '@rudderstack/rudder-sdk-node';
import { EventEmitter } from 'events';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import { type ContentViewMetadata } from './eventStream/contentViewsStream';
import { EventStreamSink } from './eventStream/EventStreamSink';
import { eventStreamRegistry } from './eventStream/registry';
import { type EventStreamRow } from './eventStream/types';
import { LightdashAnalytics, type DashboardView } from './LightdashAnalytics';

const payload: DashboardView = {
    event: 'dashboard.view',
    userId: 'reader',
    properties: {
        dashboardId: 'dashboard',
        projectId: 'project',
        organizationId: 'org',
        parametersCount: 0,
    },
};
const metadata: ContentViewMetadata = {
    contentId: 'dashboard',
    contentType: 'dashboard',
    contentName: 'Revenue',
    projectName: 'Demo',
    spaceId: 'space',
    spaceName: 'Shared',
    createdAt: '2026-09-01T00:00:00Z',
    isVerified: true,
    context: 'backend',
    actorType: 'user',
};
const setup = (enabled = true) => {
    const writer = {
        push: vi.fn<(stream: string, row: EventStreamRow) => void>(),
        flush: vi.fn(async () => {}),
        close: vi.fn(async () => {}),
    };
    const eventEmitter = new EventEmitter();
    const eventMetric = vi.fn();
    eventEmitter.on('analytics.track.dashboard.view', eventMetric);
    const analytics = new LightdashAnalytics({
        lightdashConfig: {
            ...lightdashConfigMock,
            usageEvents: { ...lightdashConfigMock.usageEvents, enabled },
            prometheus: {
                ...lightdashConfigMock.prometheus,
                enabled: true,
                eventMetricsEnabled: true,
            },
            rudder: { writeKey: 'key', dataPlaneUrl: 'notrack' },
        },
        writeKey: 'key',
        dataPlaneUrl: 'notrack',
        options: { enable: false },
        eventEmitter,
        eventStreamSink: enabled
            ? new EventStreamSink(eventStreamRegistry, writer)
            : undefined,
    });
    const rudder = vi
        .spyOn(Analytics.prototype, 'track')
        .mockImplementation(() => analytics);
    return { analytics, writer, eventMetric, rudder };
};

afterEach(() => vi.restoreAllMocks());

describe('Backend content view tracking', () => {
    it('emits one enriched usage row without changing RudderStack, event metrics or the input', () => {
        const { analytics, writer, eventMetric, rudder } = setup();
        const original = structuredClone(payload);
        analytics.track(payload, metadata);
        expect(writer.push).toHaveBeenCalledTimes(1);
        expect(writer.push).toHaveBeenCalledWith(
            'content_views',
            expect.objectContaining({
                event_name: 'dashboard.view',
                content_id: 'dashboard',
                content_name: 'Revenue',
                project_name: 'Demo',
                space_name: 'Shared',
                is_verified: true,
                is_qualifying: true,
                actor_type: 'user',
                view_context: 'backend',
                event_id: expect.any(String),
            }),
        );
        expect(rudder).toHaveBeenCalledTimes(1);
        expect(rudder).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'lightdash_server.dashboard.view',
                properties: original.properties,
            }),
        );
        expect(eventMetric).toHaveBeenCalledWith(original);
        expect(payload).toEqual(original);
    });

    it('assigns different identities to separate backend fetches', () => {
        const { analytics, writer } = setup();
        analytics.track(payload, metadata);
        analytics.track(payload, metadata);
        expect(writer.push).toHaveBeenCalledTimes(2);
        expect(writer.push.mock.calls[0][1].event_id).not.toBe(
            writer.push.mock.calls[1][1].event_id,
        );
    });

    it.each(['preview', 'embed'] as const)(
        'excludes known %s reads from qualifying views',
        (context) => {
            const { analytics, writer } = setup();
            analytics.track(payload, {
                ...metadata,
                context,
                actorType: context === 'embed' ? 'embed' : 'user',
            });
            expect(writer.push.mock.calls[0][1].is_qualifying).toBe(false);
        },
    );

    it('preserves legacy analytics when the usage sink is disabled', () => {
        const { analytics, writer, rudder } = setup(false);
        analytics.track(payload, metadata);
        expect(writer.push).not.toHaveBeenCalled();
        expect(rudder).toHaveBeenCalledTimes(1);
        expect(rudder.mock.calls[0][0].properties).toEqual(payload.properties);
    });

    it('does not throw or suppress legacy analytics when the usage writer fails', () => {
        const { analytics, writer, rudder } = setup();
        writer.push.mockImplementation(() => {
            throw new Error('storage unavailable');
        });
        expect(() => analytics.track(payload, metadata)).not.toThrow();
        expect(rudder).toHaveBeenCalledTimes(1);
    });

    it('keeps legacy events without metadata unclassified', () => {
        const { analytics, writer } = setup();
        analytics.track(payload);
        expect(writer.push.mock.calls[0][1]).toMatchObject({
            event_id: null,
            view_context: 'unknown',
            is_qualifying: false,
        });
    });
});
