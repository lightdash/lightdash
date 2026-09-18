import { WarehouseTypes, type Connection } from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type FC, type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMissingConnection } from '../store/sqlRunnerSlice';
import {
    useReconcileActiveConnection,
    useReportMissingConnection,
} from './useConnectionReconciliation';

const PROJECT_UUID = 'project-uuid';

const connection = (connectionUuid: string, name: string): Connection => ({
    connectionUuid,
    name,
    warehouseType: WarehouseTypes.POSTGRES,
    organizationWarehouseCredentialsUuid: null,
    listAllDatabases: false,
    additionalDatabases: [],
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
});

const postgres = connection('connection-postgres', 'postgres');
const marketing = connection('connection-marketing', 'marketing');

const dispatch = vi.fn();
const showToastInfo = vi.fn();
const invalidateQueries = vi.fn();

let state = {
    projectUuid: PROJECT_UUID,
    connectionUuid: marketing.connectionUuid as string | undefined,
};
let projectConnections: Connection[] | undefined = [postgres, marketing];

vi.mock('../store/hooks', () => ({
    useAppDispatch: () => dispatch,
    useAppSelector: (
        selector: (store: { sqlRunner: typeof state }) => unknown,
    ) => selector({ sqlRunner: state }),
}));

vi.mock('../../../hooks/useProject', () => ({
    useProject: () => ({
        data: projectConnections
            ? { connections: projectConnections }
            : undefined,
    }),
}));

vi.mock('../../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastInfo }),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
    const actual = await importOriginal<object>();
    return { ...actual, useQueryClient: () => ({ invalidateQueries }) };
});

const wrapper: FC<PropsWithChildren> = ({ children }) =>
    createElement(QueryClientProvider, { client: new QueryClient() }, children);

describe('useReconcileActiveConnection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state = {
            projectUuid: PROJECT_UUID,
            connectionUuid: marketing.connectionUuid,
        };
        projectConnections = [postgres, marketing];
        window.localStorage.clear();
    });

    it('leaves a connection that is still on the project alone', async () => {
        renderHook(() => useReconcileActiveConnection(), { wrapper });

        await waitFor(() => expect(dispatch).not.toHaveBeenCalled());
        expect(showToastInfo).not.toHaveBeenCalled();
    });

    it('clears a connection the project no longer lists and says so', async () => {
        projectConnections = [postgres];

        renderHook(() => useReconcileActiveConnection(), { wrapper });

        await waitFor(() =>
            expect(dispatch).toHaveBeenCalledWith(clearMissingConnection()),
        );
        expect(showToastInfo).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'This connection was removed' }),
        );
    });

    it('waits for the project before deciding anything', async () => {
        projectConnections = undefined;

        renderHook(() => useReconcileActiveConnection(), { wrapper });

        await waitFor(() => expect(dispatch).not.toHaveBeenCalled());
    });

    it('forgets the removed connection as the last one used', async () => {
        window.localStorage.setItem(
            `lightdash.sqlRunner.lastConnection.${PROJECT_UUID}`,
            marketing.connectionUuid,
        );
        projectConnections = [postgres];

        renderHook(() => useReconcileActiveConnection(), { wrapper });

        await waitFor(() =>
            expect(
                window.localStorage.getItem(
                    `lightdash.sqlRunner.lastConnection.${PROJECT_UUID}`,
                ),
            ).toBeNull(),
        );
    });
});

describe('useReportMissingConnection', () => {
    beforeEach(() => vi.clearAllMocks());

    it('refetches the project when a call names a missing connection', () => {
        const { result } = renderHook(() => useReportMissingConnection(), {
            wrapper,
        });

        result.current({
            status: 'error',
            error: { name: 'NotFoundError', message: 'Connection not found' },
        });

        expect(invalidateQueries).toHaveBeenCalledWith([
            'project',
            PROJECT_UUID,
        ]);
    });

    it('ignores every other failure', () => {
        const { result } = renderHook(() => useReportMissingConnection(), {
            wrapper,
        });

        result.current(new Error('syntax error at or near "SELCT"'));
        result.current(undefined);

        expect(invalidateQueries).not.toHaveBeenCalled();
    });
});
