import { GoogleAuth } from 'google-auth-library';
import { describe, expect, test, vi } from 'vitest';
import { deriveBigqueryRefreshGrantExecutionScope } from './bigqueryRefreshGrantExecutionScope';

const grant = {
    type: 'authorized_user',
    client_id: 'test-application',
    client_secret: 'private-client-secret',
    refresh_token: 'private-refresh-grant',
};
const workforceGrant = {
    ...grant,
    type: 'external_account_authorized_user',
    audience:
        '//iam.googleapis.com/locations/global/workforcePools/pool/providers/provider',
    token_url: 'https://sts.googleapis.com/v1/oauthtoken',
    token_info_url: 'https://sts.googleapis.com/v1/introspect',
};
const args = {
    actorId: 'actor-1',
    credentialSourceId: 'adc-project-1',
    secret: 'private-server-key',
};

describe('deriveBigqueryRefreshGrantExecutionScope', () => {
    test.each([grant, workforceGrant])(
        'proves the actual SDK-loaded $type grant without requesting tokens or warehouse data',
        async (credentials) => {
            const authClient = new GoogleAuth({
                projectId: 'test-project',
                credentials,
            });
            const client = await authClient.getClient();
            const getAccessToken = vi.spyOn(client, 'getAccessToken');
            const getClient = vi.spyOn(authClient, 'getClient');
            const first = await deriveBigqueryRefreshGrantExecutionScope({
                ...args,
                authClient,
            });
            expect(first).toEqual({
                status: 'proven',
                hash: expect.stringMatching(/^[a-f0-9]{64}$/),
            });
            expect(getClient).toHaveBeenCalledOnce();
            client.setCredentials({
                access_token: 'newly-issued-access-token',
                expiry_date: Date.now() + 3600000,
            });
            expect(
                await deriveBigqueryRefreshGrantExecutionScope({
                    ...args,
                    authClient,
                }),
            ).toEqual(first);
            expect(getAccessToken).not.toHaveBeenCalled();
            expect(JSON.stringify(first)).not.toContain('private');
            expect(JSON.stringify(first)).not.toContain('actor-1');
        },
    );

    test('loads ADC through the SDK before reading the effective source', async () => {
        const authClient: {
            jsonContent: unknown;
            getClient: () => Promise<unknown>;
        } = {
            jsonContent: null,
            getClient: vi.fn(async () => {
                authClient.jsonContent = grant;
                return {};
            }),
        };
        expect(
            await deriveBigqueryRefreshGrantExecutionScope({
                ...args,
                authClient,
            }),
        ).toEqual({ status: 'proven', hash: expect.any(String) });
        expect(authClient.getClient).toHaveBeenCalledOnce();
    });

    test('changes proof for a different actual runtime grant, actor, source, endpoint, or server key', async () => {
        const authClient = {
            jsonContent: workforceGrant,
            getClient: async () => ({}),
        };
        const input = { ...args, authClient };
        const first = await deriveBigqueryRefreshGrantExecutionScope(input);
        const changed = await Promise.all(
            [
                { ...input, actorId: 'actor-2' },
                { ...input, credentialSourceId: 'adc-project-2' },
                { ...input, secret: 'rotated-server-key' },
                {
                    ...input,
                    authClient: {
                        ...authClient,
                        jsonContent: {
                            ...workforceGrant,
                            refresh_token: 'another-principal-grant',
                        },
                    },
                },
                {
                    ...input,
                    authClient: {
                        ...authClient,
                        jsonContent: {
                            ...workforceGrant,
                            token_url: 'https://different.example/token',
                        },
                    },
                },
                {
                    ...input,
                    authClient: {
                        ...authClient,
                        jsonContent: {
                            ...workforceGrant,
                            audience:
                                '//iam.googleapis.com/locations/global/workforcePools/other/providers/provider',
                        },
                    },
                },
            ].map(deriveBigqueryRefreshGrantExecutionScope),
        );
        for (const proof of changed) {
            expect(proof).not.toEqual(first);
        }
    });

    test('excludes transient tokens and canonicalizes SDK source key order', async () => {
        const first = await deriveBigqueryRefreshGrantExecutionScope({
            ...args,
            authClient: { jsonContent: grant, getClient: async () => ({}) },
        });
        const source = {
            ...Object.fromEntries(Object.entries(grant).reverse()),
            access_token: 'new-access-token',
            token: 'new-token',
            expiry_date: Date.now() + 3600000,
            expires_in: 3600,
        };
        expect(
            await deriveBigqueryRefreshGrantExecutionScope({
                ...args,
                authClient: {
                    jsonContent: source,
                    getClient: async () => ({}),
                },
            }),
        ).toEqual(first);
    });

    test.each([
        null,
        {
            type: 'service_account',
            client_email: 'use-known-principal@example.com',
        },
        { ...grant, refresh_token: '' },
        { ...grant, client_id: '' },
        { ...grant, client_secret: '' },
        {
            type: 'external_account',
            audience:
                '//iam.googleapis.com/locations/global/workforcePools/pool/providers/provider',
            credential_source: {
                file: '/same/file/can/contain/different/subjects',
            },
            // These unrelated fields cannot convert direct federation into a
            // proven refresh grant or an inferred service-account principal.
            ...{
                client_email: 'stale@example.com',
                refresh_token: 'stale',
                client_id: 'stale',
                client_secret: 'stale',
            },
        },
    ])(
        'does not infer refresh identity from unsupported or incomplete source',
        async (jsonContent) => {
            expect(
                await deriveBigqueryRefreshGrantExecutionScope({
                    ...args,
                    authClient: { jsonContent, getClient: async () => ({}) },
                }),
            ).toEqual({ status: 'unavailable' });
        },
    );

    test('does not expose failed ADC discovery or accept an unbound source', async () => {
        const authClient = {
            jsonContent: grant,
            getClient: vi.fn(async () => {
                throw new Error('private-secret-in-sdk-error');
            }),
        };
        expect(
            await deriveBigqueryRefreshGrantExecutionScope({
                ...args,
                authClient,
            }),
        ).toEqual({ status: 'unavailable' });
        const missingBindings = await Promise.all(
            [
                { ...args, actorId: '' },
                { ...args, credentialSourceId: '' },
                { ...args, secret: '' },
            ].map((binding) =>
                deriveBigqueryRefreshGrantExecutionScope({
                    ...binding,
                    authClient,
                }),
            ),
        );
        expect(missingBindings).toEqual([
            { status: 'unavailable' },
            { status: 'unavailable' },
            { status: 'unavailable' },
        ]);
        expect(authClient.getClient).toHaveBeenCalledOnce();
    });
});
