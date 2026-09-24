import {
    DimensionType,
    FieldType,
    MetricType,
    type DataAppVizField,
    type ItemsMap,
    type SuggestedChartTypeFields,
} from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../../api';
import { useAmbientFieldSuggestions } from './useAmbientFieldSuggestions';
import { type LoadedExplore } from './useExplorePreviewData';

vi.mock('../../../api', () => ({ lightdashApi: vi.fn() }));

const field = (name: string, fieldType: FieldType) => ({
    fieldType,
    type: fieldType === FieldType.METRIC ? MetricType.SUM : DimensionType.DATE,
    name,
    label: name,
    table: 'orders',
    tableLabel: 'Orders',
    sql: `\${TABLE}.${name}`,
    hidden: false,
});

const itemsMap = {
    orders_date: field('date', FieldType.DIMENSION),
    orders_total: field('total', FieldType.METRIC),
} as unknown as ItemsMap;

const explore: LoadedExplore = {
    name: 'orders',
    label: 'Orders',
    joinedTableLabels: [],
    fields: [],
    itemsMap,
};

const fields: DataAppVizField[] = [
    { name: 'x', label: 'X', type: 'dimension', required: true },
    { name: 'value', label: 'Value', type: 'metric', required: true },
];

const context = { prompt: 'revenue over time', clarifications: [] };

const answer: SuggestedChartTypeFields = {
    suggestions: [
        {
            fieldName: 'x',
            fieldIds: ['orders_date'],
            reason: 'Date is the time axis.',
            alternatives: [],
        },
        {
            fieldName: 'value',
            fieldIds: ['orders_total'],
            reason: 'Total is the revenue.',
            alternatives: [],
        },
    ],
};

const wrapper = () => {
    const queryClient = new QueryClient();
    return ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
};

type Props = Parameters<typeof useAmbientFieldSuggestions>[0];

describe('useAmbientFieldSuggestions', () => {
    beforeEach(() => {
        vi.mocked(lightdashApi).mockReset();
        vi.mocked(lightdashApi).mockResolvedValue(answer);
    });

    it('asks about the suggested table before it is attached and reuses the answer on attach', async () => {
        const initial: Props = {
            projectUuid: 'p1',
            enabled: true,
            sourceKey: null,
            explore: null,
            fields,
            context,
            suggestedExploreName: 'orders',
        };
        const { result, rerender } = renderHook(
            (props: Props) => useAmbientFieldSuggestions(props),
            { wrapper: wrapper(), initialProps: initial },
        );

        await waitFor(() => expect(lightdashApi).toHaveBeenCalledOnce());
        expect(lightdashApi).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                url: '/ai/p1/chart-type/suggest-fields',
                body: JSON.stringify({
                    prompt: 'revenue over time',
                    clarifications: [],
                    exploreName: 'orders',
                    fields,
                }),
            }),
        );
        expect(result.current.seed).toEqual({});

        rerender({ ...initial, sourceKey: 'orders:1', explore });

        await waitFor(() =>
            expect(result.current.seed).toEqual({
                x: 'orders_date',
                value: 'orders_total',
            }),
        );
        expect(lightdashApi).toHaveBeenCalledTimes(1);
    });

    it('does not ask ahead for the table already attached', async () => {
        renderHook((props: Props) => useAmbientFieldSuggestions(props), {
            wrapper: wrapper(),
            initialProps: {
                projectUuid: 'p1',
                enabled: true,
                sourceKey: 'orders:1',
                explore,
                fields,
                context,
                suggestedExploreName: 'orders',
            } satisfies Props,
        });

        await waitFor(() => expect(lightdashApi).toHaveBeenCalledOnce());
    });

    it('asks a different table fresh when the author picks it instead', async () => {
        const initial: Props = {
            projectUuid: 'p1',
            enabled: true,
            sourceKey: null,
            explore: null,
            fields,
            context,
            suggestedExploreName: 'orders',
        };
        const { rerender } = renderHook(
            (props: Props) => useAmbientFieldSuggestions(props),
            { wrapper: wrapper(), initialProps: initial },
        );
        await waitFor(() => expect(lightdashApi).toHaveBeenCalledOnce());

        rerender({
            ...initial,
            sourceKey: 'customers:1',
            explore: { ...explore, name: 'customers', label: 'Customers' },
        });

        await waitFor(() => expect(lightdashApi).toHaveBeenCalledTimes(2));
        expect(vi.mocked(lightdashApi).mock.calls[1][0].body).toContain(
            '"exploreName":"customers"',
        );
    });
});
