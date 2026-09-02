import { type MobilePushNotificationsConfig } from '../../config/parseConfig';
import {
    buildAgentRunAlertMessage,
    buildAgentRunDataMessage,
    FcmClient,
    type FcmAccessTokenSource,
    type FcmHttpTransport,
} from './FcmClient';

const config: MobilePushNotificationsConfig = {
    enabled: true,
    bundleId: 'com.lightdash.mobile',
    teamId: 'TEAMID',
    sandbox: undefined,
    production: undefined,
    fcm: {
        projectId: 'lightdash-mobile',
        clientEmail: 'push@lightdash-mobile.iam.gserviceaccount.com',
        privateKey: 'private-key',
    },
};

const dataMessage = buildAgentRunDataMessage({
    state: 'working',
    event: 'update',
    liveActivityUuid: 'activity-uuid',
    projectUuid: 'project-uuid',
    agentUuid: 'agent-uuid',
    threadUuid: 'thread-uuid',
    promptUuid: 'prompt-uuid',
    timestamp: new Date('2026-08-30T12:01:00.000Z'),
    staleAt: new Date('2026-08-30T12:06:00.000Z'),
});

const createClient = (
    response: { status: number; body?: string },
    clientConfig: MobilePushNotificationsConfig = config,
) => {
    const transport = {
        send: vi.fn(async () => response),
    } satisfies FcmHttpTransport;
    const accessTokenSource = {
        getToken: vi.fn(async () => 'access-token'),
    } satisfies FcmAccessTokenSource;

    return {
        client: new FcmClient({
            config: clientConfig,
            transport,
            accessTokenSource,
        }),
        transport,
        accessTokenSource,
    };
};

describe('buildAgentRunDataMessage', () => {
    it('sends the run state as string data with a collapse key', () => {
        expect(dataMessage).toEqual({
            data: {
                type: 'agent_run',
                state: 'working',
                event: 'update',
                liveActivityUuid: 'activity-uuid',
                projectUuid: 'project-uuid',
                agentUuid: 'agent-uuid',
                threadUuid: 'thread-uuid',
                promptUuid: 'prompt-uuid',
                timestamp: '1788091260',
                staleAt: '1788091560',
            },
            android: {
                priority: 'high',
                collapse_key: 'activity-uuid',
                ttl: '300s',
            },
        });
    });
});

describe('buildAgentRunAlertMessage', () => {
    it('carries the alert text and the thread identifiers', () => {
        expect(
            buildAgentRunAlertMessage({
                collapseId: 'activity-uuid',
                alert: { title: 'Lightdash', body: 'Your agent finished.' },
                projectUuid: 'project-uuid',
                agentUuid: 'agent-uuid',
                threadUuid: 'thread-uuid',
                promptUuid: 'prompt-uuid',
            }),
        ).toEqual({
            notification: {
                title: 'Lightdash',
                body: 'Your agent finished.',
            },
            data: {
                type: 'agent_run_completed',
                projectUuid: 'project-uuid',
                agentUuid: 'agent-uuid',
                threadUuid: 'thread-uuid',
                promptUuid: 'prompt-uuid',
            },
            android: {
                priority: 'high',
                collapse_key: 'activity-uuid',
            },
        });
    });
});

describe('FcmClient.sendAgentRunUpdate', () => {
    it('posts the message to the project endpoint with a bearer token', async () => {
        const { client, transport, accessTokenSource } = createClient({
            status: 200,
            body: '{"name":"projects/lightdash-mobile/messages/1"}',
        });

        const result = await client.sendAgentRunUpdate({
            pushToken: 'registration-token',
            payload: dataMessage,
        });

        expect(result).toEqual({ status: 'sent' });
        expect(accessTokenSource.getToken).toHaveBeenCalledWith({
            clientEmail: 'push@lightdash-mobile.iam.gserviceaccount.com',
            privateKey: 'private-key',
        });
        expect(transport.send).toHaveBeenCalledWith({
            url: 'https://fcm.googleapis.com/v1/projects/lightdash-mobile/messages:send',
            headers: {
                authorization: 'Bearer access-token',
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                message: { token: 'registration-token', ...dataMessage },
            }),
        });
    });

    it('reports an unregistered token as invalid', async () => {
        const { client } = createClient({
            status: 404,
            body: JSON.stringify({
                error: {
                    code: 404,
                    status: 'NOT_FOUND',
                    details: [{ errorCode: 'UNREGISTERED' }],
                },
            }),
        });

        expect(
            await client.sendAgentRunUpdate({
                pushToken: 'registration-token',
                payload: dataMessage,
            }),
        ).toEqual({ status: 'invalid_token', reason: 'UNREGISTERED' });
    });

    it('reports a mismatched sender as invalid', async () => {
        const { client } = createClient({
            status: 403,
            body: JSON.stringify({
                error: {
                    status: 'PERMISSION_DENIED',
                    details: [{ errorCode: 'SENDER_ID_MISMATCH' }],
                },
            }),
        });

        expect(
            await client.sendAgentRunUpdate({
                pushToken: 'registration-token',
                payload: dataMessage,
            }),
        ).toEqual({ status: 'invalid_token', reason: 'SENDER_ID_MISMATCH' });
    });

    it.each([429, 500, 503])('retries on status %i', async (status) => {
        const { client } = createClient({ status });

        expect(
            await client.sendAgentRunUpdate({
                pushToken: 'registration-token',
                payload: dataMessage,
            }),
        ).toEqual({ status: 'retryable', reason: undefined });
    });

    it('fails on an unrecognised error', async () => {
        const { client } = createClient({
            status: 400,
            body: JSON.stringify({ error: { status: 'FAILED_PRECONDITION' } }),
        });

        expect(
            await client.sendAgentRunUpdate({
                pushToken: 'registration-token',
                payload: dataMessage,
            }),
        ).toEqual({ status: 'failed', reason: 'FAILED_PRECONDITION' });
    });

    it.each<MobilePushNotificationsConfig>([
        { ...config, fcm: undefined },
        { ...config, enabled: false },
    ])('refuses to send without configuration', async (clientConfig) => {
        const { client, transport } = createClient(
            { status: 200 },
            clientConfig,
        );

        expect(
            await client.sendAgentRunUpdate({
                pushToken: 'registration-token',
                payload: dataMessage,
            }),
        ).toEqual({ status: 'failed', reason: 'fcm_not_configured' });
        expect(transport.send).not.toHaveBeenCalled();
    });

    it('retries when the transport throws', async () => {
        const transport = {
            send: vi.fn(async () => {
                throw new Error('boom');
            }),
        } satisfies FcmHttpTransport;
        const client = new FcmClient({
            config,
            transport,
            accessTokenSource: { getToken: vi.fn(async () => 'access-token') },
        });

        expect(
            await client.sendAgentRunUpdate({
                pushToken: 'registration-token',
                payload: dataMessage,
            }),
        ).toEqual({ status: 'retryable', reason: 'Error' });
    });
});
