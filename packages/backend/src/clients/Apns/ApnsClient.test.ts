import { EventEmitter } from 'events';
import { constants, type ClientHttp2Session } from 'http2';
import { type MobilePushNotificationsConfig } from '../../config/parseConfig';
import {
    ApnsClient,
    buildLiveActivityPayload,
    buildLiveActivityStartPayload,
    NodeApnsHttpTransport,
    type ApnsHttpTransport,
    type ApnsProviderTokenSource,
} from './ApnsClient';

const config: MobilePushNotificationsConfig = {
    enabled: true,
    bundleId: 'com.lightdash.mobile',
    teamId: 'TEAMID',
    sandbox: { keyId: 'SANDBOX', privateKey: 'sandbox-private-key' },
    production: { keyId: 'PRODUCTION', privateKey: 'production-private-key' },
    fcm: undefined,
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

describe('NodeApnsHttpTransport', () => {
    it('cancels a hung HTTP/2 stream before the processing lease can reopen', async () => {
        vi.useFakeTimers();
        const stream = Object.assign(new EventEmitter(), {
            setEncoding: vi.fn(),
            end: vi.fn(),
            close: vi.fn(),
        });
        const session = Object.assign(new EventEmitter(), {
            closed: false,
            destroyed: false,
            request: vi.fn(() => stream),
        }) as unknown as ClientHttp2Session;
        const transport = new NodeApnsHttpTransport(() => session, 100);
        const client = new ApnsClient({
            config,
            transport,
            providerTokenSource: {
                getToken: vi.fn(async () => 'provider-token'),
            },
        });

        const delivery = client.sendLiveActivity({
            environment: 'sandbox',
            pushToken: 'activity-token',
            payload: { aps: { timestamp: 1, event: 'update' } },
        });
        await vi.advanceTimersByTimeAsync(100);

        await expect(delivery).resolves.toEqual({
            status: 'retryable',
            reason: 'ApnsRequestTimeoutError',
        });
        expect(stream.close).toHaveBeenCalledWith(constants.NGHTTP2_CANCEL);
        vi.useRealTimers();
    });
});

describe('ApnsClient.sendLiveActivity', () => {
    it.each<MobilePushNotificationsConfig>([
        { ...config, enabled: false },
        { ...config, teamId: undefined },
        { ...config, sandbox: undefined },
    ])(
        'does not attempt delivery with incomplete configuration',
        async (incompleteConfig) => {
            const transport = {
                send: vi.fn(async () => ({ status: 200 })),
            } satisfies ApnsHttpTransport;
            const providerTokenSource = {
                getToken: vi.fn(async () => 'provider-token'),
            } satisfies ApnsProviderTokenSource;
            const client = new ApnsClient({
                config: incompleteConfig,
                transport,
                providerTokenSource,
            });

            await expect(
                client.sendLiveActivity({
                    environment: 'sandbox',
                    pushToken: 'activity-token',
                    payload: { aps: { timestamp: 1, event: 'update' } },
                }),
            ).resolves.toEqual({
                status: 'failed',
                reason: 'environment_not_configured',
            });
            expect(providerTokenSource.getToken).not.toHaveBeenCalled();
            expect(transport.send).not.toHaveBeenCalled();
        },
    );

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

describe('ApnsClient.sendLiveActivityStart', () => {
    it('sends the exact start payload to the push-to-start token with stable headers', async () => {
        const { client, transport } = createClient({ status: 200 });
        const payload = buildLiveActivityStartPayload({
            timestamp: new Date('2026-08-31T12:00:00.000Z'),
            staleAt: new Date('2026-08-31T12:05:00.000Z'),
            liveActivityUuid: '00000000-0000-0000-0000-000000000008',
            installationUuid: '00000000-0000-0000-0000-000000000003',
            projectUuid: '00000000-0000-0000-0000-000000000004',
            agentUuid: '00000000-0000-0000-0000-000000000005',
            threadUuid: '00000000-0000-0000-0000-000000000006',
            promptUuid: '00000000-0000-0000-0000-000000000007',
            agentName: 'Mobile Demo Agent',
            taskSummary: 'Getting your Chrome usage stats',
        });

        await client.sendLiveActivityStart({
            environment: 'sandbox',
            pushToStartToken: 'push-to-start-token',
            liveActivityUuid: '00000000-0000-0000-0000-000000000008',
            payload,
        });
        await client.sendLiveActivityStart({
            environment: 'sandbox',
            pushToStartToken: 'push-to-start-token',
            liveActivityUuid: '00000000-0000-0000-0000-000000000008',
            payload,
        });

        const expectedRequest = {
            origin: 'https://api.sandbox.push.apple.com',
            headers: {
                ':method': 'POST',
                ':path': '/3/device/push-to-start-token',
                authorization: 'bearer provider-token',
                'apns-collapse-id': '00000000-0000-0000-0000-000000000008',
                'apns-id': '00000000-0000-0000-0000-000000000008',
                'apns-priority': '10',
                'apns-push-type': 'liveactivity',
                'apns-topic': 'com.lightdash.mobile.push-type.liveactivity',
            },
            body: JSON.stringify(payload),
        };
        expect(transport.send).toHaveBeenNthCalledWith(1, expectedRequest);
        expect(transport.send).toHaveBeenNthCalledWith(2, expectedRequest);
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

describe('buildLiveActivityStartPayload', () => {
    it('matches AgentRunActivityAttributes with display context', () => {
        const payload = buildLiveActivityStartPayload({
            timestamp: new Date('2026-08-31T12:00:00.000Z'),
            staleAt: new Date('2026-08-31T12:05:00.000Z'),
            liveActivityUuid: 'live-activity-uuid',
            installationUuid: 'installation-uuid',
            projectUuid: 'project-uuid',
            agentUuid: 'agent-uuid',
            threadUuid: 'thread-uuid',
            promptUuid: 'prompt-uuid',
            agentName: 'Mobile Demo Agent',
            taskSummary: 'Getting your Chrome usage stats',
        });

        expect(payload).toEqual({
            aps: {
                timestamp: 1788177600,
                event: 'start',
                'content-state': {
                    state: 'working',
                    projectUuid: 'project-uuid',
                    agentUuid: 'agent-uuid',
                    threadUuid: 'thread-uuid',
                    promptUuid: 'prompt-uuid',
                },
                'stale-date': 1788177900,
                'attributes-type': 'AgentRunActivityAttributes',
                attributes: {
                    liveActivityUuid: 'live-activity-uuid',
                    installationUuid: 'installation-uuid',
                    projectUuid: 'project-uuid',
                    agentUuid: 'agent-uuid',
                    threadUuid: 'thread-uuid',
                    promptUuid: 'prompt-uuid',
                    agentName: 'Mobile Demo Agent',
                    taskSummary: 'Getting your Chrome usage stats',
                },
                'input-push-token': 1,
                alert: {
                    title: 'Lightdash',
                    body: 'Your agent is running.',
                },
            },
        });
        expect(JSON.stringify(payload)).not.toMatch(
            /answer text|dashboard|organization|customer|secret/i,
        );
    });

    it('limits display context to the text rendered by iOS', () => {
        const payload = buildLiveActivityStartPayload({
            timestamp: new Date('2026-08-31T12:00:00.000Z'),
            staleAt: new Date('2026-08-31T12:05:00.000Z'),
            liveActivityUuid: 'live-activity-uuid',
            installationUuid: 'installation-uuid',
            projectUuid: 'project-uuid',
            agentUuid: 'agent-uuid',
            threadUuid: 'thread-uuid',
            promptUuid: 'prompt-uuid',
            agentName: '  Mobile\n Demo   Agent  ',
            taskSummary: `  ${'chrome usage '.repeat(40)}  `,
        });

        expect(payload.aps.attributes.agentName).toBe('Mobile Demo Agent');
        expect(payload.aps.attributes.taskSummary).toBe(
            'chrome usage chrome usage chrome usage chrome usage chrome…',
        );
    });

    it('keeps the safe fallback when display context is empty', () => {
        const payload = buildLiveActivityStartPayload({
            timestamp: new Date('2026-08-31T12:00:00.000Z'),
            staleAt: new Date('2026-08-31T12:05:00.000Z'),
            liveActivityUuid: 'live-activity-uuid',
            installationUuid: 'installation-uuid',
            projectUuid: 'project-uuid',
            agentUuid: 'agent-uuid',
            threadUuid: 'thread-uuid',
            promptUuid: 'prompt-uuid',
            agentName: '   ',
            taskSummary: '\n',
        });

        expect(payload.aps.attributes.agentName).toBeNull();
        expect(payload.aps.attributes.taskSummary).toBeNull();
    });
});
