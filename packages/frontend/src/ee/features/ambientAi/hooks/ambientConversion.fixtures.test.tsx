import { TableCalculationType } from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import nock from 'nock';
import { type PropsWithChildren } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { createLightdashApi } from '../../../../api';
import { explore } from '../../../../hooks/cartesianChartConfig/useCartesianChartConfig.mock';
import { useConvertSqlToFormula } from '../../../../hooks/useConvertSqlToFormula';
import { LightdashApiContext } from '../../../../providers/LightdashApi/LightdashApiContext';
import { mockSavedChartResponse } from '../../../../testing/savedChartResponse.mock';

const formula = {
    formula: '1 + 1',
    displayName: 'Synthetic calculation',
    type: TableCalculationType.NUMBER,
    format: null,
};

afterEach(cleanup);

it.each(['delayed-success', 'error', 'malformed-json'] as const)(
    'exercises the conversion consumer with a deterministic transport: %s',
    async (outcome) => {
        const client = new QueryClient({
            defaultOptions: { mutations: { retry: false } },
            logger: { log: () => {}, warn: () => {}, error: () => {} },
        });
        const api = createLightdashApi(() => undefined);
        const onSuccess = vi.fn();
        const request = nock('http://test.lightdash')
            .post(
                '/api/v1/ai/project/formula-table-calculation/generate',
                (body) => {
                    expect(body).toMatchObject({
                        mode: 'convert-sql',
                        sourceSql: '1 + 1',
                    });
                    expect(body.fieldsContext).toBeInstanceOf(Array);
                    return true;
                },
            )
            .delayBody(outcome === 'delayed-success' ? 6100 : 0)
            .reply(
                outcome === 'error' ? 503 : 200,
                outcome === 'malformed-json'
                    ? '{invalid-json'
                    : outcome === 'error'
                      ? {
                            status: 'error',
                            error: {
                                name: 'Error',
                                statusCode: 503,
                                message: 'Synthetic unavailable',
                            },
                        }
                      : { status: 'ok', results: formula },
                { 'Content-Type': 'application/json' },
            );
        const wrapper = ({ children }: PropsWithChildren) => (
            <QueryClientProvider client={client}>
                <LightdashApiContext.Provider value={api}>
                    {children}
                </LightdashApiContext.Provider>
            </QueryClientProvider>
        );
        const view = renderHook(
            () =>
                useConvertSqlToFormula({
                    projectUuid: 'project',
                    explore,
                    metricQuery: mockSavedChartResponse().metricQuery,
                    onSuccess,
                }),
            { wrapper },
        );
        act(() => view.result.current.convert('1 + 1'));
        if (outcome === 'delayed-success') {
            await waitFor(
                () => expect(view.result.current.result).toEqual(formula),
                { timeout: 8000 },
            );
            expect(onSuccess).toHaveBeenCalledOnce();
        } else {
            await waitFor(() =>
                expect(view.result.current.error).not.toBe(null),
            );
            expect(view.result.current.result).toBe(null);
            expect(onSuccess).not.toHaveBeenCalled();
        }
        expect(request.isDone()).toBe(true);
        if (outcome === 'malformed-json') {
            expect(console.error).toHaveBeenCalledWith(
                'Failed to reach the Lightdash server:',
                expect.objectContaining({
                    name: 'UnexpectedResponseError',
                    status: 200,
                }),
            );
            vi.mocked(console.error).mockClear();
        }
        view.unmount();
        client.clear();
    },
    10000,
);
