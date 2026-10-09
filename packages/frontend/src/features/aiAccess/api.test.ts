import { waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sharedLightdashApi } from '../../api';
import { mockedLightdashApi } from '../../testing/mockedLightdashApi';
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
vi.mock('../../api');
describe('AI access API URLs', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedLightdashApi.mockResolvedValue({});
    });
    it.each([null, 'connection / one'])(
        'builds connection-scoped URLs for %s',
        async (connection) => {
            const suffix = connection ? '?connection=connection+%2F+one' : '';
            await aiAccessApi.capabilities(
                sharedLightdashApi,
                'project',
                connection,
            );
            expect(sharedLightdashApi).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    version: 'v2',
                    method: 'GET',
                    url: `/projects/project/ai-access/capabilities${suffix}`,
                }),
            );
            await aiAccessApi.me(sharedLightdashApi, 'project', connection);
            expect(sharedLightdashApi).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    url: `/projects/project/ai-access/me${suffix}`,
                }),
            );
        },
    );
});

describe('Organization agent identity request gating', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedLightdashApi.mockResolvedValue({});
    });
    it.each([false, undefined])(
        'makes no request when the flag is %s',
        (enabled) => {
            flagEnabled = enabled;
            const { result } = renderHookWithProviders(() =>
                useOrganizationAgentIdentitySettings(),
            );
            expect(result.current.fetchStatus).toBe('idle');
            expect(sharedLightdashApi).not.toHaveBeenCalled();
        },
    );
    it('loads the rules when the flag is enabled', async () => {
        flagEnabled = true;
        renderHookWithProviders(() => useOrganizationAgentIdentitySettings());
        await waitFor(() =>
            expect(sharedLightdashApi).toHaveBeenCalledExactlyOnceWith({
                version: 'v2',
                url: '/org/agent-identity',
                method: 'GET',
                body: undefined,
            }),
        );
    });
});

describe('AI service account status', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedLightdashApi.mockResolvedValue({});
    });
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
        mockedLightdashApi.response.mockResolvedValue(status);
        const { result } = renderHookWithProviders(() =>
            useAiServiceAccount('preview'),
        );
        await waitFor(() => expect(result.current.data).toEqual(status));
        expect(sharedLightdashApi.response).toHaveBeenCalledExactlyOnceWith({
            version: 'v2',
            url: '/projects/preview/ai-access/service-account',
            method: 'GET',
            body: undefined,
        });
    });
});
