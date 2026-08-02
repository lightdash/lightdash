import {
    RedshiftAuthenticationType,
    WarehouseTypes,
    type UserWarehouseCredentials,
} from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
    type Mock,
} from 'vitest';
import { useRedshiftAwsSsoLoginPopup } from './useRedshiftAwsSso';

vi.mock('../api', () => ({
    lightdashApi: vi.fn(),
}));

vi.mock('./toaster/useToaster', () => ({
    default: () => ({
        showToastError: vi.fn(),
    }),
}));

import { lightdashApi } from '../api';

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

describe('useRedshiftAwsSsoLoginPopup', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('opens AWS SSO, polls until authenticated, and returns the created credentials', async () => {
        const popupWindow = {
            close: vi.fn(),
        } as unknown as Window;
        vi.spyOn(window, 'open').mockReturnValue(popupWindow);

        const credentials: UserWarehouseCredentials = {
            uuid: 'credential-uuid',
            name: 'Redshift AWS SSO',
            userUuid: 'user-uuid',
            createdAt: new Date(),
            updatedAt: new Date(),
            credentials: {
                type: WarehouseTypes.REDSHIFT,
                authenticationType: RedshiftAuthenticationType.IAM_BROWSER,
                user: 'javier',
            },
            project: null,
        };
        mockApi
            .mockResolvedValueOnce({
                verificationUri: 'https://device.sso.aws.amazon.com',
                verificationUriComplete:
                    'https://device.sso.aws.amazon.com/?user_code=ABCD-EFGH',
                userCode: 'ABCD-EFGH',
                expiresIn: 60,
                interval: 1,
            })
            .mockResolvedValueOnce({ status: 'pending' })
            .mockResolvedValueOnce({
                status: 'authenticated',
                credentials,
            });
        const onLogin = vi.fn();

        const { result } = renderHook(
            () =>
                useRedshiftAwsSsoLoginPopup({
                    onLogin,
                }),
            { wrapper: createWrapper() },
        );

        let login: Promise<UserWarehouseCredentials>;
        act(() => {
            login = result.current.mutateAsync({
                projectUuid: 'project-uuid',
                projectName: 'Project',
                databaseUser: 'javier',
            });
        });

        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });

        expect(window.open).toHaveBeenCalledWith(
            'https://device.sso.aws.amazon.com/?user_code=ABCD-EFGH',
            'aws-sso-login-popup',
            'width=600,height=700',
        );

        await act(async () => {
            await vi.advanceTimersByTimeAsync(1000);
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1000);
        });

        await expect(login!).resolves.toEqual(credentials);
        expect(onLogin).toHaveBeenCalledWith(credentials);
        expect(popupWindow.close).toHaveBeenCalledTimes(1);
        expect(mockApi).toHaveBeenNthCalledWith(1, {
            url: '/user/warehouseCredentials/redshift/aws-sso/start',
            method: 'POST',
            body: JSON.stringify({
                projectUuid: 'project-uuid',
            }),
        });
        expect(mockApi).toHaveBeenNthCalledWith(2, {
            url: '/user/warehouseCredentials/redshift/aws-sso/complete',
            method: 'POST',
            body: JSON.stringify({
                projectUuid: 'project-uuid',
                projectName: 'Project',
                credentialsName: undefined,
                databaseUser: 'javier',
            }),
        });
    });
});
