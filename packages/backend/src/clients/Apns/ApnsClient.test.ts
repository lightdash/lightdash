import { type MobilePushNotificationsConfig } from '../../config/parseConfig';
import {
    ApnsClient,
    buildLiveActivityPayload,
    type ApnsHttpTransport,
    type ApnsProviderTokenSource,
} from './ApnsClient';

const config: MobilePushNotificationsConfig = {
    enabled: true,
    bundleId: 'com.lightdash.mobile',
    teamId: 'TEAMID',
    sandbox: { keyId: 'SANDBOX', privateKey: 'sandbox-private-key' },
    production: { keyId: 'PRODUCTION', privateKey: 'production-private-key' },
};

const createClient = (response: { status: number; body?: string }) => {
    const transport = {
        send: vi.fn(async () => response),
    } satisfies ApnsHttpTransport;
    const providerTokenSource = {
        getToken: vi.fn(async () => 'provider-token'),
    } satisfies ApnsProviderTokenSource;

    return {
        client: new ApnsClient({ config, transport, providerTokenSource }),
        transport,
        providerTokenSource,
    };
};

describe('ApnsClient.sendLiveActivity', () => {
    it('sends a sandbox Live Activity request with exact APNs headers', async () => {
        const { client, transport, providerTokenSource } = createClient({
            status: 200,
        });
        const payload = { aps: { timestamp: 1, event: 'update' as const } };

        await expect(
            client.sendLiveActivity({
                environment: 'sandbox',
                pushToken: 'activity-token',
                payload,
            }),
        ).resolves.toEqual({ status: 'sent' });

        expect(providerTokenSource.getToken).toHaveBeenCalledWith({
            environment: 'sandbox',
            teamId: 'TEAMID',
            keyId: 'SANDBOX',
            privateKey: 'sandbox-private-key',
        });
        expect(transport.send).toHaveBeenCalledWith({
            origin: 'https://api.sandbox.push.apple.com',
            headers: {
                ':method': 'POST',
                ':path': '/3/device/activity-token',
                authorization: 'bearer provider-token',
                'apns-priority': '10',
                'apns-push-type': 'liveactivity',
                'apns-topic': 'com.lightdash.mobile.push-type.liveactivity',
            },
            body: JSON.stringify(payload),
        });
    });

    it('uses the production APNs origin and credential', async () => {
        const { client, transport, providerTokenSource } = createClient({
            status: 200,
        });

        await client.sendLiveActivity({
            environment: 'production',
            pushToken: 'activity-token',
            payload: { aps: { timestamp: 1, event: 'update' } },
        });

        expect(providerTokenSource.getToken).toHaveBeenCalledWith(
            expect.objectContaining({
                environment: 'production',
                keyId: 'PRODUCTION',
            }),
        );
        expect(transport.send).toHaveBeenCalledWith(
            expect.objectContaining({
                origin: 'https://api.push.apple.com',
            }),
        );
    });

    it.each([
        { status: 410, body: '{"reason":"Unregistered"}' },
        { status: 400, body: '{"reason":"BadDeviceToken"}' },
        { status: 400, body: '{"reason":"DeviceTokenNotForTopic"}' },
    ])('classifies stale activity tokens as invalid', async (response) => {
        const { client } = createClient(response);

        await expect(
            client.sendLiveActivity({
                environment: 'sandbox',
                pushToken: 'activity-token',
                payload: { aps: { timestamp: 1, event: 'update' } },
            }),
        ).resolves.toEqual({
            status: 'invalid_token',
            reason: JSON.parse(response.body).reason,
        });
    });

    it.each([429, 500, 503])(
        'classifies APNs status %s as retryable',
        async (status) => {
            const { client } = createClient({ status });

            await expect(
                client.sendLiveActivity({
                    environment: 'sandbox',
                    pushToken: 'activity-token',
                    payload: { aps: { timestamp: 1, event: 'update' } },
                }),
            ).resolves.toEqual({ status: 'retryable', reason: undefined });
        },
    );

    it('does not expose a push token from a transport error', async () => {
        const transport = {
            send: vi.fn(async () => {
                throw new Error('request /3/device/activity-token failed');
            }),
        } satisfies ApnsHttpTransport;
        const providerTokenSource = {
            getToken: vi.fn(async () => 'provider-token'),
        } satisfies ApnsProviderTokenSource;
        const client = new ApnsClient({
            config,
            transport,
            providerTokenSource,
        });

        const result = await client.sendLiveActivity({
            environment: 'sandbox',
            pushToken: 'activity-token',
            payload: { aps: { timestamp: 1, event: 'update' } },
        });

        expect(result).toEqual({ status: 'retryable', reason: 'Error' });
        expect(JSON.stringify(result)).not.toContain('activity-token');
    });
});

describe('ApnsClient.sendAlert', () => {
    it('sends a device alert with the app topic and a stable collapse ID', async () => {
        const { client, transport } = createClient({ status: 200 });
        const payload = {
            aps: {
                alert: {
                    title: 'Approved title',
                    body: 'Approved body',
                },
            },
            projectUuid: 'project-uuid',
            agentUuid: 'agent-uuid',
            threadUuid: 'thread-uuid',
            promptUuid: 'prompt-uuid',
        };

        await expect(
            client.sendAlert({
                environment: 'production',
                deviceToken: 'device-token',
                collapseId: 'activity-uuid',
                payload,
            }),
        ).resolves.toEqual({ status: 'sent' });

        expect(transport.send).toHaveBeenCalledWith({
            origin: 'https://api.push.apple.com',
            headers: {
                ':method': 'POST',
                ':path': '/3/device/device-token',
                authorization: 'bearer provider-token',
                'apns-collapse-id': 'activity-uuid',
                'apns-priority': '10',
                'apns-push-type': 'alert',
                'apns-topic': 'com.lightdash.mobile',
            },
            body: JSON.stringify(payload),
        });
    });
});

describe('buildLiveActivityPayload', () => {
    it('contains state and opaque identifiers without user content', () => {
        const payload = buildLiveActivityPayload({
            state: 'waiting_for_you',
            timestamp: new Date('2026-08-30T12:00:00.000Z'),
            staleAt: new Date('2026-08-30T12:05:00.000Z'),
            event: 'update',
            projectUuid: 'project-uuid',
            agentUuid: 'agent-uuid',
            threadUuid: 'thread-uuid',
            promptUuid: 'prompt-uuid',
        });

        expect(payload).toEqual({
            aps: {
                timestamp: 1788091200,
                event: 'update',
                'stale-date': 1788091500,
                'content-state': {
                    state: 'waiting_for_you',
                    projectUuid: 'project-uuid',
                    agentUuid: 'agent-uuid',
                    threadUuid: 'thread-uuid',
                    promptUuid: 'prompt-uuid',
                },
            },
        });
        expect(JSON.stringify(payload)).not.toMatch(
            /question|answer|projectName|organization|title|body/i,
        );
    });

    it('ends and dismisses an idle activity without an alert body', () => {
        const payload = buildLiveActivityPayload({
            state: 'idle',
            timestamp: new Date('2026-08-30T12:00:00.000Z'),
            staleAt: new Date('2026-08-30T12:00:00.000Z'),
            dismissalAt: new Date('2026-08-30T12:01:00.000Z'),
            event: 'end',
            projectUuid: 'project-uuid',
            agentUuid: 'agent-uuid',
            threadUuid: 'thread-uuid',
            promptUuid: 'prompt-uuid',
        });

        expect(payload.aps).toMatchObject({
            event: 'end',
            'dismissal-date': 1788091260,
        });
        expect(payload.aps).not.toHaveProperty('alert');
    });
});
