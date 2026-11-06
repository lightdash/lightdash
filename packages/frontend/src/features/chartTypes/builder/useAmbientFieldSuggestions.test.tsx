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
import { sharedLightdashApi } from '../../../api';
import { mockedLightdashApi } from '../../../testing/mockedLightdashApi';
import { useAmbientFieldSuggestions } from './useAmbientFieldSuggestions';
import { type LoadedExplore } from './useExplorePreviewData';

vi.mock('../../../api');

const accessState = vi.hoisted(() => ({ disabled: false }));
vi.mock('../../aiAccess/useAiAccessGate', () => ({
    useAiAccessGate: () => accessState,
}));

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
        accessState.disabled = false;
        mockedLightdashApi.mockReset();
        mockedLightdashApi.mockResolvedValue(answer);
    });

    it('does not fetch or prefetch while disabled, and hides cached picks', async () => {
        const initial: Props = {
            projectUuid: 'p1',
            enabled: false,
            sourceKey: 'orders:1',
            explore,
            fields,
            context,
            suggestedExploreName: 'other-orders',
        };
        const { result, rerender } = renderHook(
            (props: Props) => useAmbientFieldSuggestions(props),
            { wrapper: wrapper(), initialProps: initial },
        );
        expect(sharedLightdashApi).not.toHaveBeenCalled();
        expect(result.current.picks).toEqual({});
        expect(result.current.pendingFieldNames.size).toBe(0);

        rerender({ ...initial, enabled: true });
        await waitFor(() =>
            expect(Object.keys(result.current.picks)).not.toHaveLength(0),
        );
        const calls = mockedLightdashApi.mock.calls.length;
        accessState.disabled = true;
        rerender({ ...initial, suggestedExploreName: 'another-table' });
        expect(result.current.picks).toEqual({});
        expect(result.current.seed).toEqual({});
        expect(result.current.pendingFieldNames.size).toBe(0);
        expect(sharedLightdashApi).toHaveBeenCalledTimes(calls);
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

        await waitFor(() => expect(sharedLightdashApi).toHaveBeenCalledOnce());
        expect(sharedLightdashApi).toHaveBeenCalledExactlyOnceWith(
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
        expect(sharedLightdashApi).toHaveBeenCalledTimes(1);
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

        await waitFor(() => expect(sharedLightdashApi).toHaveBeenCalledOnce());
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
        await waitFor(() => expect(sharedLightdashApi).toHaveBeenCalledOnce());

        rerender({
            ...initial,
            sourceKey: 'customers:1',
            explore: { ...explore, name: 'customers', label: 'Customers' },
        });

        await waitFor(() =>
            expect(sharedLightdashApi).toHaveBeenCalledTimes(2),
        );
        expect(mockedLightdashApi.mock.calls[1][0].body).toContain(
            '"exploreName":"customers"',
        );
    });
});
