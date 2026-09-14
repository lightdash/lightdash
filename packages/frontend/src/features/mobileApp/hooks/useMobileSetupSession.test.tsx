import { MobileSetupCodeStatus } from '@lightdash/common';
import type * as MantineHooks from '@mantine/hooks';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('../../../api', () => ({
    lightdashApi: vi.fn(),
}));

vi.mock('../../../hooks/toaster/useToaster', () => ({
    default: () => ({
        showToastSuccess: vi.fn(),
        showToastApiError: vi.fn(),
        showToastError: vi.fn(),
    }),
}));

let documentVisibility: DocumentVisibilityState = 'visible';

vi.mock('@mantine/hooks', async (importOriginal) => ({
    ...(await importOriginal<typeof MantineHooks>()),
    useDocumentVisibility: () => documentVisibility,
}));

import { lightdashApi } from '../../../api';
import { useMobileSetupSession } from './useMobileSetupSession';

const mockApi = lightdashApi as Mock;

const PROJECT_UUID = 'project-uuid';
const CODE_ID = 'code-id';

const mintedCode = (
    overrides: { codeId?: string; expiresAt?: string } = {},
) => ({
    codeId: overrides.codeId ?? CODE_ID,
    code: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',
    link: 'https://app.example.com/mobile-setup?v=1&i=x&c=y',
    expiresAt:
        overrides.expiresAt ?? new Date(Date.now() + 300_000).toISOString(),
    projectUuid: PROJECT_UUID,
});

const codeState = (status: MobileSetupCodeStatus) => ({
    codeId: CODE_ID,
    status,
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
    redeemedAt: null,
    redeemedPlatform: null,
});

const createWrapper = () => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
    return ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
};

const callsTo = (method: string, urlPart: string) =>
    mockApi.mock.calls.filter(
        ([args]) => args.method === method && args.url.includes(urlPart),
    );

describe('useMobileSetupSession', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        documentVisibility = 'visible';
        mockApi.mockImplementation(({ method }: { method: string }) => {
            if (method === 'POST') return Promise.resolve(mintedCode());
            if (method === 'GET')
                return Promise.resolve(
                    codeState(MobileSetupCodeStatus.PENDING),
                );
            return Promise.resolve(null);
        });
    });

    it('mints a code on mount and marks the request sensitive', async () => {
        const { result } = renderHook(
            () =>
                useMobileSetupSession({
                    projectUuid: PROJECT_UUID,
                    enabled: true,
                }),
            { wrapper: createWrapper() },
        );

        await waitFor(() => expect(result.current.link).toBeDefined());

        expect(mockApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/user/me/mobile-setup-codes',
                method: 'POST',
                sensitive: true,
            }),
        );
    });

    it('does not mint until a project is known', () => {
        renderHook(
            () =>
                useMobileSetupSession({
                    projectUuid: undefined,
                    enabled: true,
                }),
            { wrapper: createWrapper() },
        );

        expect(callsTo('POST', 'mobile-setup-codes')).toHaveLength(0);
    });

    it('revokes the code when the page unmounts', async () => {
        const { result, unmount } = renderHook(
            () =>
                useMobileSetupSession({
                    projectUuid: PROJECT_UUID,
                    enabled: true,
                }),
            { wrapper: createWrapper() },
        );

        await waitFor(() => expect(result.current.link).toBeDefined());
        unmount();

        await waitFor(() =>
            expect(
                callsTo('DELETE', `mobile-setup-codes/${CODE_ID}`),
            ).toHaveLength(1),
        );
    });

    it('reports the redeemed state', async () => {
        mockApi.mockImplementation(({ method }: { method: string }) => {
            if (method === 'POST') return Promise.resolve(mintedCode());
            if (method === 'GET')
                return Promise.resolve(
                    codeState(MobileSetupCodeStatus.REDEEMED),
                );
            return Promise.resolve(null);
        });

        const { result } = renderHook(
            () =>
                useMobileSetupSession({
                    projectUuid: PROJECT_UUID,
                    enabled: true,
                }),
            { wrapper: createWrapper() },
        );

        await waitFor(() =>
            expect(result.current.status).toBe(MobileSetupCodeStatus.REDEEMED),
        );
    });

    it('mints again when the user sets up another device', async () => {
        const { result } = renderHook(
            () =>
                useMobileSetupSession({
                    projectUuid: PROJECT_UUID,
                    enabled: true,
                }),
            { wrapper: createWrapper() },
        );

        await waitFor(() => expect(result.current.link).toBeDefined());
        expect(callsTo('POST', 'mobile-setup-codes')).toHaveLength(1);

        result.current.setupAnotherDevice();

        await waitFor(() =>
            expect(callsTo('POST', 'mobile-setup-codes')).toHaveLength(2),
        );
    });

    it('rotates a code that is already inside the rotation window', async () => {
        mockApi.mockImplementation(({ method }: { method: string }) => {
            if (method === 'POST')
                return Promise.resolve(
                    mintedCode({
                        expiresAt: new Date(Date.now() + 5_000).toISOString(),
                    }),
                );
            if (method === 'GET')
                return Promise.resolve(
                    codeState(MobileSetupCodeStatus.PENDING),
                );
            return Promise.resolve(null);
        });

        const { result } = renderHook(
            () =>
                useMobileSetupSession({
                    projectUuid: PROJECT_UUID,
                    enabled: true,
                }),
            { wrapper: createWrapper() },
        );

        await waitFor(() => expect(result.current.link).toBeDefined());
        await waitFor(() =>
            expect(
                callsTo('POST', 'mobile-setup-codes').length,
            ).toBeGreaterThan(1),
        );
    });

    it('does not rotate while the tab is hidden', async () => {
        documentVisibility = 'hidden';
        mockApi.mockImplementation(({ method }: { method: string }) => {
            if (method === 'POST')
                return Promise.resolve(
                    mintedCode({
                        expiresAt: new Date(Date.now() + 5_000).toISOString(),
                    }),
                );
            if (method === 'GET')
                return Promise.resolve(
                    codeState(MobileSetupCodeStatus.PENDING),
                );
            return Promise.resolve(null);
        });

        const { result } = renderHook(
            () =>
                useMobileSetupSession({
                    projectUuid: PROJECT_UUID,
                    enabled: true,
                }),
            { wrapper: createWrapper() },
        );

        await waitFor(() => expect(result.current.link).toBeDefined());
        await new Promise((resolve) => {
            setTimeout(resolve, 100);
        });

        expect(callsTo('POST', 'mobile-setup-codes')).toHaveLength(1);
    });
});
