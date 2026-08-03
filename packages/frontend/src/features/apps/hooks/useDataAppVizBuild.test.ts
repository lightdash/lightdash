import { type ApiAppVersionSummary } from '@lightdash/common';
import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHookWithProviders } from '../../../testing/testUtils';
import { useAppBuildPoller } from './useAppBuildPoller';
import { useCancelAppVersion } from './useCancelAppVersion';
import { useDataAppVizBuild } from './useDataAppVizBuild';
import { useDeleteApp } from './useDeleteApp';
import { useGenerateApp } from './useGenerateApp';
import { useIterateApp } from './useIterateApp';

vi.mock('./useGenerateApp', () => ({ useGenerateApp: vi.fn() }));
vi.mock('./useIterateApp', () => ({ useIterateApp: vi.fn() }));
vi.mock('./useAppBuildPoller', () => ({ useAppBuildPoller: vi.fn() }));
vi.mock('./useCancelAppVersion', () => ({ useCancelAppVersion: vi.fn() }));
vi.mock('./useDeleteApp', () => ({ useDeleteApp: vi.fn() }));

const mockedGenerate = vi.mocked(useGenerateApp);
const mockedIterate = vi.mocked(useIterateApp);
const mockedPoller = vi.mocked(useAppBuildPoller);
const mockedCancel = vi.mocked(useCancelAppVersion);
const mockedDelete = vi.mocked(useDeleteApp);

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
    let cancelVersion: ReturnType<typeof vi.fn>;
    let deleteApp: ReturnType<typeof vi.fn>;
    let iterate: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        generate = vi.fn();
        cancelVersion = vi.fn();
        deleteApp = vi.fn();
        iterate = vi.fn();
        mockedGenerate.mockReturnValue({
            mutate: generate,
            isLoading: false,
        } as unknown as ReturnType<typeof useGenerateApp>);
        mockedCancel.mockReturnValue({
            mutate: cancelVersion,
        } as unknown as ReturnType<typeof useCancelAppVersion>);
        mockedDelete.mockReturnValue({
            mutate: deleteApp,
        } as unknown as ReturnType<typeof useDeleteApp>);
        mockedIterate.mockReturnValue({
            mutate: iterate,
            isLoading: false,
        } as unknown as ReturnType<typeof useIterateApp>);
    });

    const setup = (
        initialDataAppVizUuid: string | null = null,
        onCreated = vi.fn(),
    ) => {
        const rendered = renderHookWithProviders(
            ({ dataAppVizUuid }: { dataAppVizUuid: string | null }) =>
                useDataAppVizBuild({
                    projectUuid: 'project-1',
                    itemsMap,
                    dataAppVizUuid,
                    onCreated,
                }),
            undefined,
            { initialProps: { dataAppVizUuid: initialDataAppVizUuid } },
        );
        return { ...rendered, onCreated };
    };

    it('shows the request in flight while building', () => {
        const { result } = setup();

        act(() =>
            result.current.send({
                description: 'a donut of orders by status',
                fileIds: [],
            }),
        );

        expect(result.current.pendingPrompt).toBe(
            'a donut of orders by status',
        );
        expect(result.current.isBuilding).toBe(true);
    });

    it('attributes new builds to the Explorer chart configuration', () => {
        const { result } = setup();

        act(() =>
            result.current.send({
                description: 'a donut of orders by status',
                fileIds: [],
            }),
        );

        expect(generate.mock.lastCall?.[0]).toMatchObject({
            creationExperience: 'explorer_chart_config',
        });
    });

    it('binds the contract off the version the poller hands back', () => {
        // Not off the query cache: the poll writes the cache and calls back in
        // the same tick, so the cache is still a render behind here.
        const { result, onCreated } = setup();

        act(() =>
            result.current.send({
                description: 'a donut',
                fileIds: [],
            }),
        );
        const handlers = generate.mock.lastCall?.[1] as GenerateHandlers;
        act(() => handlers.onSuccess({ appUuid: 'viz-1', version: 1 }));
        finishBuild(finishedVersion());

        expect(onCreated).toHaveBeenCalledWith('viz-1', { x: 'orders_status' });
        expect(result.current.isBuilding).toBe(false);
    });

    it('reports why a build failed and stops building', () => {
        const { result, onCreated } = setup();

        act(() =>
            result.current.send({
                description: 'a donut',
                fileIds: [],
            }),
        );
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

        act(() => result.current.send({ description: 'a donut', fileIds: [] }));
        const handlers = generate.mock.lastCall?.[1] as GenerateHandlers;
        act(() => handlers.onSuccess({ appUuid: 'viz-1', version: 1 }));

        rerender({ dataAppVizUuid: 'picked-viz' });
        finishBuild(finishedVersion());

        expect(onCreated).not.toHaveBeenCalled();
    });

    it('retries a request the server never accepted, as it was sent', () => {
        const { result } = setup();

        act(() =>
            result.current.send({
                description: 'a donut',
                fileIds: [],
            }),
        );
        const handlers = generate.mock.lastCall?.[1] as GenerateHandlers;
        act(() => handlers.onError(new Error('Network error')));

        expect(result.current.pendingPrompt).toBeNull();
        expect(result.current.retry).not.toBeNull();

        act(() => result.current.retry?.());
        expect(generate).toHaveBeenCalledTimes(2);
        expect(result.current.pendingPrompt).toBe('a donut');
    });

    it('revises the selected visualization instead of making another', () => {
        const { result, onCreated } = setup('viz-1');

        act(() =>
            result.current.send({
                description: 'make the bars teal',
                fileIds: [],
            }),
        );

        expect(generate).not.toHaveBeenCalled();
        expect(iterate.mock.lastCall?.[0]).toMatchObject({
            projectUuid: 'project-1',
            appUuid: 'viz-1',
            creationExperience: 'explorer_chart_config',
        });

        const handlers = iterate.mock.lastCall?.[1] as GenerateHandlers;
        act(() => handlers.onSuccess({ appUuid: 'viz-1', version: 2 }));
        finishBuild(finishedVersion({ version: 2 }));

        expect(onCreated).not.toHaveBeenCalled();
        expect(result.current.isBuilding).toBe(false);
    });

    it('does not offer a revision as a draft', () => {
        const { result } = setup('viz-1');

        act(() =>
            result.current.send({
                description: 'make the bars teal',
                fileIds: [],
            }),
        );
        const handlers = iterate.mock.lastCall?.[1] as GenerateHandlers;
        act(() => handlers.onSuccess({ appUuid: 'viz-1', version: 2 }));

        expect(result.current.draft).toBeNull();
        expect(result.current.discard).toBeNull();
    });

    it('cancels a revision without deleting its app', () => {
        const { result } = setup('viz-1');

        act(() =>
            result.current.send({
                description: 'make the bars teal',
                fileIds: [],
            }),
        );
        const iterateHandlers = iterate.mock.lastCall?.[1] as GenerateHandlers;
        act(() => iterateHandlers.onSuccess({ appUuid: 'viz-1', version: 2 }));
        act(() => result.current.cancel?.());

        expect(cancelVersion).toHaveBeenCalledWith(
            {
                projectUuid: 'project-1',
                appUuid: 'viz-1',
                version: 2,
            },
            expect.anything(),
        );
        expect(deleteApp).not.toHaveBeenCalled();

        const cancelHandlers = cancelVersion.mock.lastCall?.[1] as {
            onSuccess: () => void;
        };
        act(() => cancelHandlers.onSuccess());
        expect(result.current.isBuilding).toBe(false);
    });

    it('retries a revision that failed to build, as it was sent', () => {
        const { result } = setup('viz-1');

        act(() =>
            result.current.send({
                description: 'make the bars teal',
                fileIds: [],
            }),
        );
        const handlers = iterate.mock.lastCall?.[1] as GenerateHandlers;
        act(() => handlers.onSuccess({ appUuid: 'viz-1', version: 2 }));
        finishBuild(
            finishedVersion({ version: 2, status: 'error', error: 'Nope' }),
        );

        expect(result.current.error).toBe('Nope');
        act(() => result.current.retry?.());
        expect(iterate).toHaveBeenCalledTimes(2);
    });

    it('refuses a second request while one is in flight', () => {
        const { result } = setup();

        act(() =>
            result.current.send({
                description: 'a donut',
                fileIds: [],
            }),
        );
        const handlers = generate.mock.lastCall?.[1] as GenerateHandlers;
        act(() => handlers.onSuccess({ appUuid: 'viz-1', version: 1 }));
        act(() =>
            result.current.send({
                description: 'actually a bar chart',
                fileIds: [],
            }),
        );

        expect(generate).toHaveBeenCalledTimes(1);
    });

    it('cancels a draft before deleting its app', () => {
        const { result } = setup();

        act(() => result.current.send({ description: 'a donut', fileIds: [] }));
        const generateHandlers = generate.mock
            .lastCall?.[1] as GenerateHandlers;
        act(() => generateHandlers.onSuccess({ appUuid: 'viz-1', version: 1 }));
        act(() => result.current.discard?.());

        expect(cancelVersion).toHaveBeenCalledWith(
            {
                projectUuid: 'project-1',
                appUuid: 'viz-1',
                version: 1,
            },
            expect.anything(),
        );
        expect(deleteApp).not.toHaveBeenCalled();

        const cancelHandlers = cancelVersion.mock.lastCall?.[1] as {
            onSettled: () => void;
        };
        act(() => cancelHandlers.onSettled());

        expect(deleteApp).toHaveBeenCalledWith({
            projectUuid: 'project-1',
            appUuid: 'viz-1',
        });
    });
});
