import { type AnyType } from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('../api', () => ({
    lightdashApi: vi.fn(),
}));

vi.mock('./toaster/useToaster', () => ({
    default: () => ({
        showToastSuccess: vi.fn(),
        showToastApiError: vi.fn(),
        showToastError: vi.fn(),
    }),
}));

vi.mock('./useQueryError', () => ({
    default: () => vi.fn(),
}));

vi.mock('../providers/ActiveJob/useActiveJob', () => ({
    default: () => ({ activeJob: undefined }),
}));

vi.mock('../providers/Tracking/useTracking', () => ({
    default: () => ({ track: vi.fn() }),
}));

import { lightdashApi } from '../api';
import { useServiceAccounts } from '../ee/features/serviceAccounts/useServiceAccounts';
import { useTestConnectionConfig } from '../features/externalConnections/hooks/useTestConnectionConfig';
import { useLoginWithEmailMutation } from '../features/users/hooks/useLogin';
import { getGdriveAccessToken } from './gdrive/useGdrive';
import {
    useCreateOrganizationWarehouseCredentials,
    useUpdateOrganizationWarehouseCredentials,
} from './organization/useOrganizationWarehouseCredentials';
import { useRotateAccessToken } from './useAccessToken';
import { usePasswordResetMutation } from './usePasswordReset';
import { useUpdateWarehouseCredentialsMutation } from './useProject';
import { useUserUpdatePasswordMutation } from './user/usePassword';
import {
    useUserWarehouseCredentialsCreateMutation,
    useUserWarehouseCredentialsUpdateMutation,
} from './userWarehouseCredentials/useUserWarehouseCredentials';

const mockApi = lightdashApi as unknown as Mock;

function createWrapper() {
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
}

describe('credential-bearing requests are marked sensitive', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockApi.mockResolvedValue(undefined);
    });

    it('login', async () => {
        const { result } = renderHook(
            () =>
                useLoginWithEmailMutation({
                    onSuccess: vi.fn(),
                    onError: vi.fn(),
                }),
            { wrapper: createWrapper() },
        );

        await result.current.mutateAsync({
            email: 'a@b.com',
            password: 'hunter2',
        });

        expect(mockApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/login',
                method: 'POST',
                sensitive: true,
            }),
        );
    });

    it('password update', async () => {
        const { result } = renderHook(() => useUserUpdatePasswordMutation(), {
            wrapper: createWrapper(),
        });

        await result.current.mutateAsync({
            password: 'old',
            newPassword: 'new',
        });

        expect(mockApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/user/password',
                method: 'POST',
                sensitive: true,
            }),
        );
    });

    it('password reset', async () => {
        const { result } = renderHook(() => usePasswordResetMutation(), {
            wrapper: createWrapper(),
        });

        await result.current.mutateAsync({
            code: 'code',
            newPassword: 'new',
        });

        expect(mockApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/user/password/reset',
                method: 'POST',
                sensitive: true,
            }),
        );
    });

    it('personal access token rotation', async () => {
        const { result } = renderHook(() => useRotateAccessToken(), {
            wrapper: createWrapper(),
        });

        await result.current.mutateAsync({
            tokenUuid: 'token-uuid',
            expiresAt: '2030-01-01',
        });

        expect(mockApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/user/me/personal-access-tokens/token-uuid/rotate',
                method: 'PATCH',
                sensitive: true,
            }),
        );
    });

    it('project warehouse credentials update', async () => {
        const { result } = renderHook(
            () => useUpdateWarehouseCredentialsMutation('project-uuid'),
            { wrapper: createWrapper() },
        );

        await result.current.mutateAsync({} as AnyType);

        expect(mockApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/projects/project-uuid/warehouse-credentials',
                method: 'PUT',
                sensitive: true,
            }),
        );
    });

    it('user warehouse credentials create and update', async () => {
        const created = renderHook(
            () => useUserWarehouseCredentialsCreateMutation(),
            { wrapper: createWrapper() },
        );
        await created.result.current.mutateAsync({} as AnyType);

        expect(mockApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/user/warehouseCredentials',
                method: 'POST',
                sensitive: true,
            }),
        );

        const updated = renderHook(
            () => useUserWarehouseCredentialsUpdateMutation('cred-uuid'),
            { wrapper: createWrapper() },
        );
        await updated.result.current.mutateAsync({} as AnyType);

        expect(mockApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/user/warehouseCredentials/cred-uuid',
                method: 'PATCH',
                sensitive: true,
            }),
        );
    });

    it('organization warehouse credentials create and update', async () => {
        const created = renderHook(
            () => useCreateOrganizationWarehouseCredentials(),
            { wrapper: createWrapper() },
        );
        await created.result.current.mutateAsync({} as AnyType);

        expect(mockApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/org/warehouse-credentials',
                method: 'POST',
                sensitive: true,
            }),
        );

        const updated = renderHook(
            () => useUpdateOrganizationWarehouseCredentials(),
            { wrapper: createWrapper() },
        );
        await updated.result.current.mutateAsync({
            uuid: 'cred-uuid',
            data: {},
        } as AnyType);

        expect(mockApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/org/warehouse-credentials/cred-uuid',
                method: 'PATCH',
                sensitive: true,
            }),
        );
    });

    it('service account create and token rotation', async () => {
        const { result } = renderHook(() => useServiceAccounts(), {
            wrapper: createWrapper(),
        });

        await result.current.createAccount.mutateAsync({} as AnyType);

        expect(mockApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/service-accounts',
                method: 'POST',
                sensitive: true,
            }),
        );

        await result.current.rotateAccount.mutateAsync({
            uuid: 'sa-uuid',
            expiresAt: '2030-01-01',
        });

        expect(mockApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/service-accounts/sa-uuid/rotate',
                method: 'PATCH',
                sensitive: true,
            }),
        );
    });

    it('external connection config test', async () => {
        const { result } = renderHook(() => useTestConnectionConfig(), {
            wrapper: createWrapper(),
        });

        await result.current.mutateAsync({
            projectUuid: 'project-uuid',
            config: {},
            path: '/',
        } as AnyType);

        expect(mockApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/ee/projects/project-uuid/external-connections/test-config',
                method: 'POST',
                sensitive: true,
            }),
        );
    });

    it('gdrive access token', async () => {
        await getGdriveAccessToken();

        expect(mockApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/gdrive/get-access-token',
                sensitive: true,
            }),
        );
    });
});
