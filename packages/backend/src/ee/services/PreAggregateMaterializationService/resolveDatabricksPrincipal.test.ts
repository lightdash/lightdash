import {
    DatabricksAuthenticationType,
    WarehouseTypes,
    type CreateDatabricksCredentials,
} from '@lightdash/common';
import { describe, expect, test, vi } from 'vitest';
import { resolveDatabricksPrincipal } from './resolveDatabricksPrincipal';

const credentials: CreateDatabricksCredentials = {
    type: WarehouseTypes.DATABRICKS,
    database: 'schema',
    serverHostName: 'workspace.cloud.databricks.com',
    httpPath: '/sql/endpoint',
    personalAccessToken: 'private-pat',
};

describe('resolveDatabricksPrincipal', () => {
    test('resolves the active token with a bounded, redirect-free request to the configured workspace', async () => {
        const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
            Response.json({
                id: '12345',
                userName: 'user@example.com',
                active: true,
                irrelevant: 'private-response-value',
            }),
        );
        const principal = await resolveDatabricksPrincipal(
            credentials,
            fetchImpl,
        );
        expect(fetchImpl).toHaveBeenCalledWith(
            new URL(
                'https://workspace.cloud.databricks.com/api/2.0/preview/scim/v2/Me',
            ),
            {
                method: 'GET',
                headers: {
                    Authorization: 'Bearer private-pat',
                    Accept: 'application/scim+json',
                },
                redirect: 'error',
                signal: expect.any(AbortSignal),
            },
        );
        expect(principal).toBe(
            JSON.stringify({
                provider: 'databricks',
                workspace: 'https://workspace.cloud.databricks.com',
                id: '12345',
                userName: 'user@example.com',
            }),
        );
        expect(principal).not.toContain('private');
    });

    test('OAuth token rotation preserves an actual principal and ignores stale PAT/client identity', async () => {
        const fetchImpl = vi
            .fn<typeof fetch>()
            .mockImplementation(async () =>
                Response.json({ id: '12345', userName: 'user@example.com' }),
            );
        const oauth = {
            ...credentials,
            authenticationType: DatabricksAuthenticationType.OAUTH_U2M,
            oauthClientId: 'application-not-user',
            token: 'oauth-token-1',
        };
        const first = await resolveDatabricksPrincipal(oauth, fetchImpl);
        expect(
            await resolveDatabricksPrincipal(
                { ...oauth, token: 'oauth-token-2' },
                fetchImpl,
            ),
        ).toBe(first);
        expect(fetchImpl.mock.calls[0]?.[1]?.headers).toEqual({
            Authorization: 'Bearer oauth-token-1',
            Accept: 'application/scim+json',
        });
        expect(
            await resolveDatabricksPrincipal(
                { ...oauth, token: undefined },
                fetchImpl,
            ),
        ).toBeUndefined();
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    test.each([
        'evil.example.com',
        'workspace.cloud.databricks.com.evil.example.com',
        'https://workspace.cloud.databricks.com/other-path',
        'https://workspace.cloud.databricks.com?redirect=evil',
    ])(
        'never sends credentials to an unsupported destination %s',
        async (serverHostName) => {
            const fetchImpl = vi.fn<typeof fetch>();
            expect(
                await resolveDatabricksPrincipal(
                    { ...credentials, serverHostName },
                    fetchImpl,
                ),
            ).toBeUndefined();
            expect(fetchImpl).not.toHaveBeenCalled();
        },
    );

    test.each([
        null,
        {},
        { id: '' },
        { id: 123 },
        { id: '123', active: false },
    ])('treats malformed or inactive identity as unavailable', async (body) => {
        const fetchImpl = vi
            .fn<typeof fetch>()
            .mockResolvedValue(Response.json(body));
        expect(
            await resolveDatabricksPrincipal(credentials, fetchImpl),
        ).toBeUndefined();
    });

    test('does not surface transport errors or HTTP response bodies', async () => {
        const fetchImpl = vi
            .fn<typeof fetch>()
            .mockRejectedValueOnce(
                new Error('private-token-in-transport-error'),
            )
            .mockResolvedValueOnce(
                new Response('private-body', { status: 403 }),
            )
            .mockResolvedValueOnce(new Response('private-invalid-json'));
        expect(
            await Promise.all(
                [0, 1, 2].map(() =>
                    resolveDatabricksPrincipal(credentials, fetchImpl),
                ),
            ),
        ).toEqual([undefined, undefined, undefined]);
    });

    test('scopes the same numeric ID by workspace and tracks principal rename', async () => {
        const fetchImpl = vi
            .fn<typeof fetch>()
            .mockImplementation(async () =>
                Response.json({ id: '12345', userName: 'user@example.com' }),
            );
        const first = await resolveDatabricksPrincipal(credentials, fetchImpl);
        expect(
            await resolveDatabricksPrincipal(
                {
                    ...credentials,
                    serverHostName: 'other.cloud.databricks.com',
                },
                fetchImpl,
            ),
        ).not.toBe(first);
        fetchImpl.mockResolvedValueOnce(
            Response.json({ id: '12345', userName: 'renamed@example.com' }),
        );
        expect(
            await resolveDatabricksPrincipal(credentials, fetchImpl),
        ).not.toBe(first);
    });
});
