import { type ApiAppVersionSummary } from '@lightdash/common';
import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHookWithProviders } from '../../../testing/testUtils';
import { useAppBuildPoller } from './useAppBuildPoller';
import { useDataAppVizBuild } from './useDataAppVizBuild';
import { useGenerateApp } from './useGenerateApp';

vi.mock('./useGenerateApp', () => ({ useGenerateApp: vi.fn() }));
vi.mock('./useAppBuildPoller', () => ({ useAppBuildPoller: vi.fn() }));

const mockedGenerate = vi.mocked(useGenerateApp);
const mockedPoller = vi.mocked(useAppBuildPoller);

type GenerateHandlers = {
    onSuccess: (result: { appUuid: string; version: number }) => void;
    onError: (error: unknown) => void;
};

/** The last `onDone` the hook handed the poller. */
const finishBuild = (version: Partial<ApiAppVersionSummary>) => {
    const onDone = mockedPoller.mock.lastCall?.[3];
    act(() => onDone?.(version as ApiAppVersionSummary));
};

const finishedVersion = (
    overrides: Partial<ApiAppVersionSummary> = {},
): Partial<ApiAppVersionSummary> => ({
    version: 1,
    status: 'ready',
    statusMessage: null,
    error: null,
    resources: {
        vizSchema: {
            fields: [
                { name: 'x', label: 'X', type: 'dimension', required: true },
            ],
        },
    } as unknown as ApiAppVersionSummary['resources'],
    ...overrides,
});

const itemsMap = {
    orders_status: {
        name: 'status',
        table: 'orders',
        label: 'Status',
        fieldType: 'dimension',
        type: 'string',
        tableLabel: 'Orders',
        sql: '',
        hidden: false,
    },
} as never;

describe('useDataAppVizBuild', () => {
    let generate: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        generate = vi.fn();
        mockedGenerate.mockReturnValue({
            mutate: generate,
            isLoading: false,
        } as unknown as ReturnType<typeof useGenerateApp>);
    });

    const setup = (onCreated = vi.fn()) => {
        const rendered = renderHookWithProviders(
            ({ dataAppVizUuid }: { dataAppVizUuid: string | null }) =>
                useDataAppVizBuild({
                    projectUuid: 'project-1',
                    itemsMap,
                    dataAppVizUuid,
                    onCreated,
                }),
            undefined,
            { initialProps: { dataAppVizUuid: null as string | null } },
        );
        return { ...rendered, onCreated };
    };

    it('shows the request in flight while building', () => {
        const { result } = setup();

        act(() =>
            result.current.send({ description: 'a donut of orders by status' }),
        );

        expect(result.current.pendingPrompt).toBe(
            'a donut of orders by status',
        );
        expect(result.current.isBuilding).toBe(true);
    });

    it('binds the contract off the version the poller hands back', () => {
        // Not off the query cache: the poll writes the cache and calls back in
        // the same tick, so the cache is still a render behind here.
        const { result, onCreated } = setup();

        act(() => result.current.send({ description: 'a donut' }));
        const handlers = generate.mock.lastCall?.[1] as GenerateHandlers;
        act(() => handlers.onSuccess({ appUuid: 'viz-1', version: 1 }));
        finishBuild(finishedVersion());

        expect(onCreated).toHaveBeenCalledWith('viz-1', { x: 'orders_status' });
        expect(result.current.isBuilding).toBe(false);
    });

    it('reports why a build failed and stops building', () => {
        const { result, onCreated } = setup();

        act(() => result.current.send({ description: 'a donut' }));
        const handlers = generate.mock.lastCall?.[1] as GenerateHandlers;
        act(() => handlers.onSuccess({ appUuid: 'viz-1', version: 1 }));
        finishBuild(
            finishedVersion({
                status: 'error',
                statusMessage: 'The sandbox ran out of memory',
            }),
        );

        expect(result.current.error).toBe('The sandbox ran out of memory');
        expect(result.current.isBuilding).toBe(false);
        expect(onCreated).not.toHaveBeenCalled();
    });

    it('does not replace a visualization picked while creation runs', () => {
        const { result, rerender, onCreated } = setup();

        act(() => result.current.send({ description: 'a donut' }));
        const handlers = generate.mock.lastCall?.[1] as GenerateHandlers;
        act(() => handlers.onSuccess({ appUuid: 'viz-1', version: 1 }));

        rerender({ dataAppVizUuid: 'picked-viz' });
        finishBuild(finishedVersion());

        expect(onCreated).not.toHaveBeenCalled();
    });

    it('retries a request the server never accepted, as it was sent', () => {
        const { result } = setup();

        act(() => result.current.send({ description: 'a donut' }));
        const handlers = generate.mock.lastCall?.[1] as GenerateHandlers;
        act(() => handlers.onError(new Error('Network error')));

        expect(result.current.pendingPrompt).toBeNull();
        expect(result.current.retry).not.toBeNull();

        act(() => result.current.retry?.());
        expect(generate).toHaveBeenCalledTimes(2);
        expect(result.current.pendingPrompt).toBe('a donut');
    });

    it('refuses a second request while one is in flight', () => {
        const { result } = setup();

        act(() => result.current.send({ description: 'a donut' }));
        const handlers = generate.mock.lastCall?.[1] as GenerateHandlers;
        act(() => handlers.onSuccess({ appUuid: 'viz-1', version: 1 }));
        act(() => result.current.send({ description: 'actually a bar chart' }));

        expect(generate).toHaveBeenCalledTimes(1);
    });
});
