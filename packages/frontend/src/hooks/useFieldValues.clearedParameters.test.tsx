import {
    DimensionType,
    FieldType,
    type FilterableItem,
} from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../api';
import DashboardContext from '../providers/Dashboard/context';
import { type DashboardContextType } from '../providers/Dashboard/types';
import { useFieldValues } from './useFieldValues';

vi.mock('../api', () => ({ lightdashApi: vi.fn() }));
vi.mock('../ee/providers/Embed/useEmbed', () => ({
    default: () => ({ embedToken: 'embed-token' }),
}));
vi.mock('./useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: false } }),
}));
vi.mock('./useSessionTimezone', () => ({ useSessionTimezone: () => null }));

const field: FilterableItem = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name: 'city',
    table: 'customers',
    label: 'City',
    tableLabel: 'Customers',
    sql: '',
    hidden: false,
};
const initialValues: string[] = [];
const parameterValues = {};

describe('embedded autocomplete cleared dashboard parameters', () => {
    it('sends clears and refreshes cached choices when suppression changes without a value change', async () => {
        vi.mocked(lightdashApi)
            .mockResolvedValueOnce({
                search: '',
                results: ['saved-only'],
                cached: false,
                refreshedAt: new Date(),
            })
            .mockResolvedValueOnce({
                search: '',
                results: ['default-only'],
                cached: false,
                refreshedAt: new Date(),
            });
        const client = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        let clearedParameters: string[] = [];
        const { result, rerender } = renderHook(
            () =>
                useFieldValues(
                    '',
                    initialValues,
                    'project',
                    field,
                    'filter',
                    undefined,
                    false,
                    false,
                    undefined,
                    parameterValues,
                ),
            {
                wrapper: ({ children }: { children: ReactNode }) => (
                    <QueryClientProvider client={client}>
                        <DashboardContext.Provider
                            value={
                                { clearedParameters } as DashboardContextType
                            }
                        >
                            {children}
                        </DashboardContext.Provider>
                    </QueryClientProvider>
                ),
            },
        );
        await waitFor(() =>
            expect(result.current.results).toEqual([{ value: 'saved-only' }]),
        );
        clearedParameters = ['status'];
        rerender();
        await waitFor(() => expect(lightdashApi).toHaveBeenCalledTimes(2));
        expect(
            JSON.parse(String(vi.mocked(lightdashApi).mock.calls[1][0].body)),
        ).toMatchObject({ parameters: {}, clearedParameters: ['status'] });
        await waitFor(() =>
            expect(result.current.results).toEqual([{ value: 'default-only' }]),
        );
    });
});
