import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type FC, type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../../api';
import { tableFieldsQueryKey } from './useTableFields';
import {
    databasesQueryKey,
    tablesQueryKey,
    useRefreshTables,
} from './useTables';

vi.mock('../../../api', () => ({ lightdashApi: vi.fn() }));

describe('SQL runner catalog query keys', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('isolates database, table, and field caches by connection UUID', () => {
        expect(databasesQueryKey('project', 'connection-a')).not.toEqual(
            databasesQueryKey('project', 'connection-b'),
        );
        expect(
            tablesQueryKey('project', 'database', 'connection-a'),
        ).not.toEqual(tablesQueryKey('project', 'database', 'connection-b'));
        expect(
            tableFieldsQueryKey({
                projectUuid: 'project',
                connectionUuid: 'connection-a',
                database: 'database',
                schema: 'schema',
                tableName: 'table',
            }),
        ).not.toEqual(
            tableFieldsQueryKey({
                projectUuid: 'project',
                connectionUuid: 'connection-b',
                database: 'database',
                schema: 'schema',
                tableName: 'table',
            }),
        );
    });

    it('refreshes the selected connection catalog', async () => {
        vi.mocked(lightdashApi).mockResolvedValue({});
        const queryClient = new QueryClient({
            defaultOptions: { mutations: { retry: false } },
        });
        const wrapper: FC<PropsWithChildren> = ({ children }) =>
            createElement(
                QueryClientProvider,
                { client: queryClient },
                children,
            );
        const { result } = renderHook(
            () =>
                useRefreshTables({
                    projectUuid: 'project-uuid',
                    connectionUuid: 'connection-uuid',
                }),
            { wrapper },
        );

        result.current.mutate();

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(lightdashApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/projects/project-uuid/sqlRunner/refresh-catalog?connectionUuid=connection-uuid',
                method: 'POST',
            }),
        );
    });
});
