import {
    SupportedDbtAdapter,
    type Explore,
    type MetricQuery,
} from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { lightdashApi } from '../api';
import { useGenerateCustomDimension } from './useGenerateCustomDimension';
import { useGenerateTableCalculation } from './useGenerateTableCalculation';

vi.mock('../api', () => ({ lightdashApi: vi.fn() }));

const explore: Explore = {
    name: 'orders',
    label: 'Order summary',
    baseTable: 'orders',
    tables: {},
    joinedTables: [],
    tags: [],
    targetDatabase: SupportedDbtAdapter.POSTGRES,
};
const metricQuery: MetricQuery = {
    exploreName: explore.name,
    dimensions: [],
    metrics: [],
    tableCalculations: [],
    filters: {},
    sorts: [],
    limit: 10,
};

const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={new QueryClient()}>
        {children}
    </QueryClientProvider>
);

describe('AI generator explore context', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(lightdashApi).mockResolvedValue({});
    });

    it.each([
        {
            generator: 'custom-dimension',
            useGenerator: useGenerateCustomDimension,
        },
        {
            generator: 'table-calculation',
            useGenerator: useGenerateTableCalculation,
        },
    ])(
        'sends the canonical explore name and display label to $generator',
        async ({ generator, useGenerator }) => {
            const { result } = renderHook(
                () =>
                    useGenerator({
                        projectUuid: 'project',
                        explore,
                        metricQuery,
                    }),
                { wrapper },
            );
            act(() => result.current.generate('one'));

            await waitFor(() => expect(lightdashApi).toHaveBeenCalledOnce());
            expect(lightdashApi).toHaveBeenCalledWith(
                expect.objectContaining({
                    url: `/ai/project/${generator}/generate`,
                    body: expect.any(String),
                }),
            );
            const request = vi.mocked(lightdashApi).mock.calls[0][0];
            expect(request.body).toBe(
                JSON.stringify({
                    prompt: 'one',
                    tableName: explore.label,
                    exploreName: explore.name,
                    fieldsContext: [],
                    ...(generator === 'table-calculation'
                        ? { existingTableCalculations: [] }
                        : {}),
                }),
            );
            await waitFor(() => expect(result.current.isLoading).toBe(false));
        },
    );
});
