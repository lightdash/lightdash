import Analytics from '@rudderstack/rudder-sdk-node';
import { EventEmitter } from 'events';
import { buildAccount, defaultJwtToken } from '../auth/account/account.mock';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import type { EmbedDashboardViewed } from '../ee/analytics';
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

describe('Embedded dashboard view tracking', () => {
    const embedPayload: EmbedDashboardViewed = {
        event: 'embed_dashboard.viewed',
        anonymousId: 'embed',
        userId: 'must-not-count-the-issuer',
        properties: {
            organizationId: 'org',
            projectId: 'project',
            dashboardId: 'dashboard',
            context: 'production',
            canExportPagePdf: true,
            externalId: 'external::fallback-token-identity',
        },
    };
    const embedMetadata: ContentViewMetadata = {
        ...metadata,
        context: 'embed',
        actorType: 'embed',
        externalUserId: 'viewer-1',
    };

    it('captures explicit external identity only in usage metadata, without counting the issuer', () => {
        const { analytics, writer, rudder } = setup();
        analytics.track(embedPayload, embedMetadata);
        expect(writer.push).toHaveBeenCalledWith(
            'content_views',
            expect.objectContaining({
                event_name: 'embed_dashboard.viewed',
                org_id: 'org',
                user_id: null,
                external_user_id: 'viewer-1',
                content_type: 'dashboard',
                content_id: 'dashboard',
                view_context: 'embed',
                actor_type: 'embed',
                is_qualifying: false,
                event_id: expect.any(String),
            }),
        );
        expect(rudder.mock.calls[0][0].properties).toEqual(
            embedPayload.properties,
        );
    });

    it('does not invent external viewers from fallback account identities', () => {
        const { analytics, writer } = setup();
        analytics.track(embedPayload, {
            ...embedMetadata,
            externalUserId: null,
        });
        expect(writer.push.mock.calls[0][1].external_user_id).toBeNull();
        expect(writer.push.mock.calls[0][1].user_id).toBeNull();
    });

    it('ignores previews and old embed events lacking usage metadata', () => {
        const { analytics, writer, rudder } = setup();
        analytics.track(embedPayload, { ...embedMetadata, context: 'preview' });
        analytics.track(embedPayload);
        expect(writer.push).not.toHaveBeenCalled();
        expect(rudder).toHaveBeenCalledTimes(2);
    });

    const embedAccount = (tenant: string, externalId?: string) => ({
        ...buildAccount({ accountType: 'jwt' }),
        organization: { organizationUuid: 'org' },
        authentication: {
            type: 'jwt' as const,
            source: 'signed-embed-token',
            data: {
                ...defaultJwtToken,
                user: { externalId },
                userAttributes: { brand: tenant, unrelated: 'not reported' },
                usageAnalytics: { tenantAttribute: 'brand' },
            },
        },
    });

    it('captures one load for a multi-tile fetch with the same source ID, without changing telemetry', () => {
        const { analytics, writer, rudder } = setup();
        const account = embedAccount('tenant-a', 'viewer-1');
        analytics.trackAccount(
            account,
            {
                ...embedPayload,
                properties: { ...embedPayload.properties, chartTilesCount: 4 },
            },
            embedMetadata,
        );
        expect(writer.push.mock.calls.map(([stream]) => stream)).toEqual([
            'content_views',
            'embed_view_events',
        ]);
        const [, legacy] = writer.push.mock.calls[0];
        const [, load] = writer.push.mock.calls[1];
        expect(load).toMatchObject({
            event_id: legacy.event_id,
            event_ts: legacy.event_ts,
            schema_version: 1,
            org_id: 'org',
            project_id: 'project',
            content_id: 'dashboard',
            external_user_id: 'viewer-1',
            embed_tenant_attribute: 'brand',
            embed_tenant_id: 'tenant-a',
            embed_token_fingerprint: null,
        });
        expect(load).not.toHaveProperty('user_id');
        expect(JSON.stringify(load)).not.toContain('not reported');
        expect(rudder).toHaveBeenCalledTimes(1);
        expect(rudder.mock.calls[0][0].properties).not.toHaveProperty(
            'embeddedUsage',
        );
    });

    it('keeps anonymous and unknown tenant attribution separate and honors the capture gate', () => {
        const { analytics, writer } = setup();
        const account = embedAccount(' ', '');
        analytics.trackAccount(account, embedPayload, embedMetadata);
        expect(writer.push.mock.calls[1][1]).toMatchObject({
            external_user_id: null,
            embed_token_fingerprint: expect.any(String),
            embed_tenant_id: null,
        });
        writer.push.mockClear();
        analytics.trackAccount(account, embedPayload, {
            ...embedMetadata,
            context: 'preview',
        });
        expect(writer.push).not.toHaveBeenCalled();

        const disabled = setup(false);
        disabled.analytics.trackAccount(account, embedPayload, embedMetadata);
        expect(disabled.writer.push).not.toHaveBeenCalled();
    });
});
