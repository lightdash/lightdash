import { type ApiAppVersionSummary } from '@lightdash/common';
import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHookWithProviders } from '../../../testing/testUtils';
import { useAppBuildPoller } from '../../apps/hooks/useAppBuildPoller';
import { useCancelAppVersion } from '../../apps/hooks/useCancelAppVersion';
import { useDeleteApp } from '../../apps/hooks/useDeleteApp';
import { useGenerateApp } from '../../apps/hooks/useGenerateApp';
import { useIterateApp } from '../../apps/hooks/useIterateApp';
import { useDataAppVizBuild } from './useDataAppVizBuild';

vi.mock('../../apps/hooks/useGenerateApp', () => ({ useGenerateApp: vi.fn() }));
vi.mock('../../apps/hooks/useIterateApp', () => ({ useIterateApp: vi.fn() }));
vi.mock('../../apps/hooks/useAppBuildPoller', () => ({
    useAppBuildPoller: vi.fn(),
}));
vi.mock('../../apps/hooks/useCancelAppVersion', () => ({
    useCancelAppVersion: vi.fn(),
}));
vi.mock('../../apps/hooks/useDeleteApp', () => ({ useDeleteApp: vi.fn() }));

const mockedGenerate = vi.mocked(useGenerateApp);
const mockedIterate = vi.mocked(useIterateApp);
const mockedPoller = vi.mocked(useAppBuildPoller);
const mockedCancel = vi.mocked(useCancelAppVersion);
const mockedDelete = vi.mocked(useDeleteApp);

type GenerateHandlers = {
    onSuccess: (result: { appUuid: string; version: number }) => void;
    onError: (error: unknown) => void;
};

type CancelHandlers = {
    onSuccess: () => void;
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
                claudeModel: 'sonnet',
                clarifications: [],
            }),
        );

        expect(result.current.pendingPrompt).toBe(
            'a donut of orders by status',
        );
        expect(result.current.isBuilding).toBe(true);
    });

    it('attributes new builds to the chart type builder', () => {
        const { result } = setup();

        act(() =>
            result.current.send({
                description: 'a donut of orders by status',
                fileIds: [],
                claudeModel: 'sonnet',
                clarifications: [],
            }),
        );

        expect(generate.mock.lastCall?.[0]).toMatchObject({
            creationExperience: 'chart_type_builder',
        });
    });

    it('sends clarifying answers with a first build, and nothing when there are none', () => {
        const { result } = setup();

        act(() =>
            result.current.send({
                description: 'show revenue split by team',
                fileIds: [],
                claudeModel: 'sonnet',
                clarifications: [
                    {
                        question: 'Over time, or one period?',
                        answer: 'monthly',
                    },
                ],
            }),
        );
        expect(generate.mock.lastCall?.[0]).toMatchObject({
            clarifications: [
                { question: 'Over time, or one period?', answer: 'monthly' },
            ],
        });

        finishBuild(finishedVersion());
        act(() =>
            result.current.send({
                description: 'a donut of orders by status',
                fileIds: [],
                claudeModel: 'sonnet',
                clarifications: [],
            }),
        );
        expect(generate.mock.lastCall?.[0].clarifications).toBeUndefined();
    });

    it('sends the picked model on both a new build and a revision', () => {
        const { result, rerender } = setup();

        act(() =>
            result.current.send({
                description: 'a donut of orders by status',
                fileIds: [],
                claudeModel: 'opus',
                clarifications: [],
            }),
        );
        expect(generate.mock.lastCall?.[0]).toMatchObject({
            claudeModel: 'opus',
        });

        rerender({ dataAppVizUuid: 'viz-1' });
        const handlers = generate.mock.lastCall?.[1] as GenerateHandlers;
        act(() => handlers.onSuccess({ appUuid: 'viz-1', version: 1 }));
        finishBuild(finishedVersion());

        act(() =>
            result.current.send({
                description: 'make it horizontal',
                fileIds: [],
                claudeModel: 'haiku',
                clarifications: [],
            }),
        );
        expect(iterate.mock.lastCall?.[0]).toMatchObject({
            claudeModel: 'haiku',
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
                claudeModel: 'sonnet',
                clarifications: [],
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
                claudeModel: 'sonnet',
                clarifications: [],
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

        act(() =>
            result.current.send({
                description: 'a donut',
                fileIds: [],
                claudeModel: 'sonnet',
                clarifications: [],
            }),
        );
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
                claudeModel: 'sonnet',
                clarifications: [],
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
                claudeModel: 'sonnet',
                clarifications: [],
            }),
        );

        expect(generate).not.toHaveBeenCalled();
        expect(iterate.mock.lastCall?.[0]).toMatchObject({
            projectUuid: 'project-1',
            appUuid: 'viz-1',
            creationExperience: 'chart_type_builder',
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
                claudeModel: 'sonnet',
                clarifications: [],
            }),
        );
        const handlers = iterate.mock.lastCall?.[1] as GenerateHandlers;
        act(() => handlers.onSuccess({ appUuid: 'viz-1', version: 2 }));

        expect(result.current.draft).toBeNull();
        expect(result.current.discard).toBeNull();
    });

    it('interrupts a draft without deleting its app', () => {
        const { result } = setup();
        let generateHandlers: GenerateHandlers | null = null;
        let cancelSucceeded: (() => void) | null = null;
        generate.mockImplementation((_params, handlers: GenerateHandlers) => {
            generateHandlers = handlers;
        });
        cancelVersion.mockImplementation(
            (_params, handlers: { onSuccess: () => void }) => {
                cancelSucceeded = handlers.onSuccess;
            },
        );

        act(() =>
            result.current.send({
                description: 'make a bar chart',
                fileIds: [],
                claudeModel: 'sonnet',
                clarifications: [],
            }),
        );
        act(() =>
            generateHandlers?.onSuccess({ appUuid: 'viz-1', version: 1 }),
        );
        act(() => result.current.interrupt?.());

        expect(cancelVersion).toHaveBeenCalledWith(
            {
                projectUuid: 'project-1',
                appUuid: 'viz-1',
                version: 1,
            },
            expect.anything(),
        );
        expect(deleteApp).not.toHaveBeenCalled();

        act(() => cancelSucceeded?.());
        expect(result.current.isBuilding).toBe(false);
    });

    it('keeps building and surfaces an interrupt failure', () => {
        const { result } = setup();
        let generateHandlers: GenerateHandlers | null = null;
        let cancelFailed: ((error: unknown) => void) | null = null;
        generate.mockImplementation((_params, handlers: GenerateHandlers) => {
            generateHandlers = handlers;
        });
        cancelVersion.mockImplementation(
            (_params, handlers: CancelHandlers) => {
                cancelFailed = handlers.onError;
            },
        );

        act(() =>
            result.current.send({
                description: 'make a bar chart',
                fileIds: [],
                claudeModel: 'sonnet',
                clarifications: [],
            }),
        );
        act(() =>
            generateHandlers?.onSuccess({ appUuid: 'viz-1', version: 1 }),
        );
        act(() => result.current.interrupt?.());
        act(() => cancelFailed?.(new Error('Request timed out')));

        expect(result.current.isBuilding).toBe(true);
        expect(result.current.cancelError).toBe('Request timed out');
        expect(result.current.interrupt).not.toBeNull();
    });

    it('cancels a revision without deleting its app', () => {
        const { result } = setup('viz-1');

        act(() =>
            result.current.send({
                description: 'make the bars teal',
                fileIds: [],
                claudeModel: 'sonnet',
                clarifications: [],
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
                claudeModel: 'sonnet',
                clarifications: [],
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
                claudeModel: 'sonnet',
                clarifications: [],
            }),
        );
        const handlers = generate.mock.lastCall?.[1] as GenerateHandlers;
        act(() => handlers.onSuccess({ appUuid: 'viz-1', version: 1 }));
        act(() =>
            result.current.send({
                description: 'actually a bar chart',
                fileIds: [],
                claudeModel: 'sonnet',
                clarifications: [],
            }),
        );

        expect(generate).toHaveBeenCalledTimes(1);
    });

    it('cancels a draft before deleting its app', () => {
        const { result } = setup();

        act(() =>
            result.current.send({
                description: 'a donut',
                fileIds: [],
                claudeModel: 'sonnet',
                clarifications: [],
            }),
        );
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
