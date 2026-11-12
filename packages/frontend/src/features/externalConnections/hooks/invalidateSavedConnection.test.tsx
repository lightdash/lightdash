import {
    type CreateExternalConnection,
    type ExternalConnection,
    type ExternalConnectionKind,
    type UpdateExternalConnection,
} from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type FC, type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockedLightdashApi } from '../../../testing/mockedLightdashApi';
import { useCreateExternalConnection } from './useCreateExternalConnection';
import { useFinishGoogleLiveSource } from './usePendingGoogleLiveSource';
import { useUpdateExternalConnection } from './useUpdateExternalConnection';

vi.mock('../../../api');
vi.mock('../../../hooks/toaster/useToaster', () => ({
    default: () => ({
        showToastSuccess: vi.fn(),
        showToastApiError: vi.fn(),
    }),
}));

const projectUuid = 'project-1';
const connectionsKey = ['external-connections', projectUuid];
const exploreListKey = ['tables', projectUuid, 'filtered'];
const exploreKey = ['tables', 'posthog_events', projectUuid];

const setup = <T,>(useHook: () => T) => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
    [connectionsKey, exploreListKey, exploreKey].forEach((key) =>
        queryClient.setQueryData(key, []),
    );
    const wrapper: FC<PropsWithChildren> = ({ children }) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
    const { result } = renderHook(useHook, { wrapper });
    const isInvalidated = (key: string[]) =>
        queryClient.getQueryState(key)?.isInvalidated;
    return { result, isInvalidated };
};

const mockSavedConnection = (kind: ExternalConnectionKind) =>
    mockedLightdashApi.mockResolvedValue({
        kind,
    } as ExternalConnection as never);

const createParams = {
    projectUuid,
    data: {} as CreateExternalConnection,
};
const updateParams = {
    projectUuid,
    connectionUuid: 'connection-1',
    data: {} as UpdateExternalConnection,
};

describe('invalidating explores after saving a connection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('refreshes the explore list when a live data source is added', async () => {
        mockSavedConnection('live_source');
        const { result, isInvalidated } = setup(useCreateExternalConnection);

        result.current.mutate(createParams);

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(isInvalidated(exploreListKey)).toBe(true);
        expect(isInvalidated(connectionsKey)).toBe(true);
    });

    it('refreshes explores when a live data source is edited', async () => {
        mockSavedConnection('live_source');
        const { result, isInvalidated } = setup(useUpdateExternalConnection);

        result.current.mutate(updateParams);

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(isInvalidated(exploreListKey)).toBe(true);
        expect(isInvalidated(exploreKey)).toBe(true);
    });

    it('refreshes the explore list when a Google property is picked', async () => {
        mockSavedConnection('live_source');
        const { result, isInvalidated } = setup(() =>
            useFinishGoogleLiveSource(projectUuid),
        );

        result.current.mutate('property-1');

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(isInvalidated(exploreListKey)).toBe(true);
        expect(isInvalidated(connectionsKey)).toBe(true);
    });

    it('leaves explores alone for a data app connection', async () => {
        mockSavedConnection('data_app');
        const { result, isInvalidated } = setup(useCreateExternalConnection);

        result.current.mutate(createParams);

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(isInvalidated(connectionsKey)).toBe(true);
        expect(isInvalidated(exploreListKey)).toBe(false);
    });
});
