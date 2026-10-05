import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../api';
import {
    useAiIdentities,
    useAiIdentitiesSql,
    useProvisionAiIdentities,
    useTestAiIdentity,
    useUpdateAiIdentity,
    useUpdateAiIdentitySettings,
} from '../../hooks/useAiIdentities';
vi.mock('../../api', () => ({ lightdashApi: vi.fn() }));
const setup = () => {
    const client = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return { client, wrapper };
};
describe('AI identity API hooks', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(lightdashApi).mockResolvedValue({});
    });
    it('fetches the v2 list only when enabled', async () => {
        const { wrapper } = setup();
        const hook = renderHook(
            ({ enabled }) => useAiIdentities('project', enabled),
            { wrapper, initialProps: { enabled: false } },
        );
        expect(lightdashApi).not.toHaveBeenCalled();
        hook.rerender({ enabled: true });
        await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
        expect(lightdashApi).toHaveBeenCalledWith({
            url: '/projects/project/ai-identities',
            method: 'GET',
            version: 'v2',
            body: undefined,
        });
    });
    it('encodes the role and waits for a role before fetching SQL', async () => {
        const { wrapper } = setup();
        const hook = renderHook(
            ({ role }) => useAiIdentitiesSql('project', role, true),
            { wrapper, initialProps: { role: '' } },
        );
        expect(lightdashApi).not.toHaveBeenCalled();
        hook.rerender({ role: 'A&B' });
        await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
        expect(lightdashApi).toHaveBeenCalledWith({
            url: '/projects/project/ai-identities/sql?role=A%26B',
            method: 'GET',
            version: 'v2',
            body: undefined,
        });
    });
    it('uses the contract for mutations and invalidates identities and SQL', async () => {
        const { client, wrapper } = setup();
        const invalidate = vi.spyOn(client, 'invalidateQueries');
        const hook = renderHook(
            () => ({
                settings: useUpdateAiIdentitySettings('project'),
                provision: useProvisionAiIdentities('project'),
                update: useUpdateAiIdentity('project'),
                test: useTestAiIdentity('project'),
            }),
            { wrapper },
        );
        await act(async () => {
            await hook.result.current.settings.mutateAsync({
                twinNameTemplate: '{snowflake_login}_AI',
            });
            await hook.result.current.provision.mutateAsync();
            await hook.result.current.update.mutateAsync({
                userUuid: 'person',
                body: { twinNameOverride: null },
            });
            await hook.result.current.test.mutateAsync('person');
        });
        expect(
            vi.mocked(lightdashApi).mock.calls.map(([request]) => request),
        ).toEqual([
            {
                url: '/projects/project/ai-identities/settings',
                method: 'PATCH',
                version: 'v2',
                body: JSON.stringify({
                    twinNameTemplate: '{snowflake_login}_AI',
                }),
            },
            {
                url: '/projects/project/ai-identities/provision',
                method: 'POST',
                version: 'v2',
                body: undefined,
            },
            {
                url: '/projects/project/ai-identities/person',
                method: 'PATCH',
                version: 'v2',
                body: JSON.stringify({ twinNameOverride: null }),
            },
            {
                url: '/projects/project/ai-identities/person/test',
                method: 'POST',
                version: 'v2',
                body: undefined,
            },
        ]);
        expect(invalidate).toHaveBeenCalledTimes(4);
        expect(invalidate).toHaveBeenCalledWith(['ai-identities', 'project']);
    });
});
