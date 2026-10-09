import {
    DatabricksAuthenticationType,
    SnowflakeAuthenticationType,
    BigqueryAuthenticationType,
    WarehouseTypes,
    type AiServiceAccountSlot,
    type ApiAiServiceAccountSaveResponse,
} from '@lightdash/common';
import { useQueryClient } from '@tanstack/react-query';
import { act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi, lightdashApiResponse } from '../../api';
import { renderHookWithProviders } from '../../testing/testUtils';
import {
    aiAccessApi,
    useAiServiceAccount,
    useSaveAiServiceAccount,
    useTestAiServiceAccount,
    useOrganizationAgentIdentitySettings,
} from './api';

let flagEnabled: boolean | undefined = false;
vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({
        data: flagEnabled === undefined ? undefined : { enabled: flagEnabled },
    }),
}));
vi.mock('../../api', () => ({
    lightdashApi: vi.fn().mockResolvedValue({}),
    lightdashApiResponse: vi.fn(),
}));
describe('AI access API URLs', () => {
    beforeEach(() => vi.clearAllMocks());
    it.each([null, 'connection / one'])(
        'builds connection-scoped URLs for %s',
        async (connection) => {
            const suffix = connection ? '?connection=connection+%2F+one' : '';
            await aiAccessApi.capabilities('project', connection);
            expect(lightdashApi).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    version: 'v2',
                    method: 'GET',
                    url: `/projects/project/ai-access/capabilities${suffix}`,
                }),
            );
            await aiAccessApi.me('project', connection);
            expect(lightdashApi).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    url: `/projects/project/ai-access/me${suffix}`,
                }),
            );
        },
    );
});

describe('Organization agent identity request gating', () => {
    beforeEach(() => vi.clearAllMocks());
    it.each([false, undefined])(
        'makes no request when the flag is %s',
        (enabled) => {
            flagEnabled = enabled;
            const { result } = renderHookWithProviders(() =>
                useOrganizationAgentIdentitySettings(),
            );
            expect(result.current.fetchStatus).toBe('idle');
            expect(lightdashApi).not.toHaveBeenCalled();
        },
    );
    it('loads the rules when the flag is enabled', async () => {
        flagEnabled = true;
        renderHookWithProviders(() => useOrganizationAgentIdentitySettings());
        await waitFor(() =>
            expect(lightdashApi).toHaveBeenCalledExactlyOnceWith({
                version: 'v2',
                url: '/org/agent-identity',
                method: 'GET',
                body: undefined,
            }),
        );
    });
});

describe('AI service account status', () => {
    beforeEach(() => vi.clearAllMocks());
    it('retains parent metadata when there is no own slot', async () => {
        flagEnabled = true;
        const status = {
            status: 'ok' as const,
            results: null,
            parent: {
                projectUuid: 'parent',
                projectName: null,
                principal: 'agent@example.test',
            },
        };
        vi.mocked(lightdashApiResponse).mockResolvedValue(status);
        const { result } = renderHookWithProviders(() =>
            useAiServiceAccount('preview'),
        );
        await waitFor(() => expect(result.current.data).toEqual(status));
        expect(lightdashApiResponse).toHaveBeenCalledExactlyOnceWith({
            version: 'v2',
            url: '/projects/preview/ai-access/service-account',
            method: 'GET',
            body: undefined,
        });
    });
});

describe('AI service account credential mutations', () => {
    const credentials = {
        type: WarehouseTypes.DATABRICKS as const,
        authenticationType: DatabricksAuthenticationType.OAUTH_M2M as const,
        oauthClientId: 'application-id',
        oauthClientSecret: 'secret-value',
    };
    const verification = {
        ok: true,
        principal: 'principal-id',
        observed: { currentUser: 'principal-id' },
        message: 'Connection works.',
        checkedAt: new Date(),
    };
    beforeEach(() => vi.clearAllMocks());
    it.each([verification, undefined])(
        'retains optional save verification: %s',
        async (resultVerification) => {
            const slot: AiServiceAccountSlot = {
                uuid: 'slot',
                identityUuid: 'identity',
                projectUuid: 'project',
                warehouseConnectionUuid: null,
                kind: 'ai_service_account',
                scope: 'connection',
                warehouseType: WarehouseTypes.DATABRICKS,
                method: 'oauth_m2m',
                createdByUserUuid: null,
                updatedByUserUuid: null,
                credentialSubjectUserUuid: null,
                createdAt: new Date('2026-10-09T12:00:00Z'),
                updatedAt: new Date('2026-10-09T12:00:00Z'),
            };
            const response: ApiAiServiceAccountSaveResponse = {
                status: 'ok',
                results: slot,
                verification: resultVerification,
            };
            vi.mocked(lightdashApiResponse).mockResolvedValue(response);
            const { result } = renderHookWithProviders(() =>
                useSaveAiServiceAccount('project'),
            );
            await act(async () => {
                await result.current.mutateAsync(credentials);
            });
            await waitFor(() =>
                expect(result.current.data).toEqual({
                    slot,
                    verification: resultVerification ?? null,
                }),
            );
            expect(lightdashApiResponse).toHaveBeenCalledWith(
                expect.objectContaining({
                    method: 'PUT',
                    sensitive: true,
                    body: JSON.stringify(credentials),
                }),
            );
        },
    );
    it.each([null, credentials])(
        'refreshes recorded verification only for a saved Test: %s',
        async (input) => {
            vi.mocked(lightdashApi).mockResolvedValue(verification);
            const { result } = renderHookWithProviders(() => ({
                test: useTestAiServiceAccount('project'),
                client: useQueryClient(),
            }));
            const invalidate = vi.spyOn(
                result.current.client,
                'invalidateQueries',
            );
            await act(async () => {
                await result.current.test.mutateAsync({ credentials: input });
            });
            expect(lightdashApi).toHaveBeenCalledWith(
                expect.objectContaining({
                    method: 'POST',
                    sensitive: true,
                    body: JSON.stringify({ credentials: input }),
                }),
            );
            if (input === null)
                expect(invalidate).toHaveBeenCalledWith(['ai-access']);
            else expect(invalidate).not.toHaveBeenCalled();
        },
    );
    it.each(['reset', 'unmount'])(
        'removes secret-bearing Save and Test mutations on %s',
        async (action) => {
            vi.mocked(lightdashApiResponse).mockResolvedValue({
                status: 'ok',
                results: null,
            });
            vi.mocked(lightdashApi).mockResolvedValue(verification);
            const { result, unmount } = renderHookWithProviders(() => ({
                save: useSaveAiServiceAccount('project'),
                test: useTestAiServiceAccount('project'),
                client: useQueryClient(),
            }));
            const cache = result.current.client.getMutationCache();
            await act(async () => {
                await result.current.test.mutateAsync({ credentials });
                await result.current.save.mutateAsync(credentials);
            });
            expect(
                cache
                    .getAll()
                    .some((mutation) => mutation.state.variables !== undefined),
            ).toBe(true);
            if (action === 'unmount') unmount();
            else
                act(() => {
                    result.current.save.reset();
                    result.current.test.reset();
                });
            expect(cache.getAll()).toHaveLength(0);
        },
    );
    it.each([false, undefined])(
        'does not load a Databricks slot when the flag is %s',
        (enabled) => {
            flagEnabled = enabled;
            renderHookWithProviders(() =>
                useAiServiceAccount('databricks-project'),
            );
            expect(lightdashApiResponse).not.toHaveBeenCalled();
        },
    );
});

describe('AI service account save', () => {
    it.each([true, false])(
        'retains Snowflake verification when present: %s',
        async (verified) => {
            const verification = verified
                ? {
                      ok: true,
                      principal: 'USER',
                      observed: { currentUser: 'USER', currentRole: 'ROLE' },
                      message: 'Connection works.',
                      checkedAt: new Date(),
                  }
                : null;
            const slot = { identityUuid: 'generation' } as AiServiceAccountSlot;
            vi.mocked(lightdashApiResponse).mockResolvedValue({
                status: 'ok',
                results: slot,
                ...(verified ? { verification } : {}),
            });
            const { result } = renderHookWithProviders(() =>
                useSaveAiServiceAccount('project'),
            );
            const credentials = {
                type: WarehouseTypes.SNOWFLAKE as const,
                authenticationType:
                    SnowflakeAuthenticationType.PRIVATE_KEY as const,
                user: 'user',
                privateKey: 'private-key',
                privateKeyPass: null,
                role: 'role',
                warehouse: 'warehouse',
            };
            await act(async () => {
                await result.current.mutateAsync(credentials);
            });
            await waitFor(() =>
                expect(result.current.data).toEqual({ slot, verification }),
            );
            expect(lightdashApiResponse).toHaveBeenLastCalledWith({
                version: 'v2',
                url: '/projects/project/ai-access/service-account',
                method: 'PUT',
                body: JSON.stringify(credentials),
                sensitive: true,
            });
            act(() => result.current.reset());
            await waitFor(() =>
                expect(result.current.variables).toBeUndefined(),
            );
        },
    );
    it('keeps the BigQuery payload and returns an explicit absent verification', async () => {
        vi.mocked(lightdashApiResponse).mockResolvedValue({
            status: 'ok',
            results: { identityUuid: 'bigquery' } as AiServiceAccountSlot,
        });
        const { result } = renderHookWithProviders(() =>
            useSaveAiServiceAccount('project'),
        );
        const credentials = {
            type: WarehouseTypes.BIGQUERY as const,
            authenticationType: BigqueryAuthenticationType.PRIVATE_KEY as const,
            keyfileContents: {
                type: 'service_account',
                client_email: 'agent@example.test',
                private_key: 'key',
            },
        };
        await act(async () => {
            await result.current.mutateAsync(credentials);
        });
        await waitFor(() =>
            expect(result.current.data).toEqual({
                slot: { identityUuid: 'bigquery' },
                verification: null,
            }),
        );
        expect(lightdashApiResponse).toHaveBeenLastCalledWith(
            expect.objectContaining({
                body: JSON.stringify(credentials),
                sensitive: true,
            }),
        );
    });
});
