import { waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi, lightdashApiResponse } from '../../api';
import { renderHookWithProviders } from '../../testing/testUtils';
import {
    aiAccessApi,
    useAiServiceAccount,
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
