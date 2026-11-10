import { type ChartMetadataStyle } from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sharedLightdashApi } from '../../../../api';
import { explore } from '../../../../hooks/cartesianChartConfig/useCartesianChartConfig.mock';
import { mockedLightdashApi } from '../../../../testing/mockedLightdashApi';
import { mockSavedChartResponse } from '../../../../testing/savedChartResponse.mock';
import { useAmbientAiEnabled } from './useAmbientAiEnabled';
import {
    getRegenerateStyleRequest,
    useRegenerateChartMetadata,
} from './useRegenerateChartMetadata';

vi.mock('../../../../api');
vi.mock('./useAmbientAiEnabled', () => ({
    useAmbientAiEnabled: vi.fn(),
}));

describe('getRegenerateStyleRequest', () => {
    it('cycles from the style after the current one', () => {
        expect(
            [0, 1, 2, 3].map((step) =>
                getRegenerateStyleRequest(step, 'question', undefined),
            ),
        ).toEqual([
            { style: 'compact' },
            { style: 'short' },
            { style: 'question' },
            { style: 'compact' },
        ]);
    });

    it('first follows the existing title when the style is unknown', () => {
        expect(
            [0, 1, 2, 3].map((step) =>
                getRegenerateStyleRequest(step, undefined, 'Weekly signups'),
            ),
        ).toEqual([
            { styleReferenceTitle: 'Weekly signups' },
            { style: 'question' },
            { style: 'compact' },
            { style: 'short' },
        ]);
    });

    it('starts the cycle when there is no title to follow', () => {
        expect(getRegenerateStyleRequest(0, undefined, '  ')).toEqual({
            style: 'question',
        });
    });
});

const chart = mockSavedChartResponse();

type SetupProps = {
    enabled?: boolean;
    disabled?: boolean;
    currentStyle?: ChartMetadataStyle | null;
};

const setup = (onGenerated = vi.fn(), options: SetupProps = {}) => {
    const client = new QueryClient();
    const wrapper = ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return renderHook(
        ({ enabled, disabled, currentStyle }: SetupProps) =>
            useRegenerateChartMetadata({
                projectUuid: 'chart-project',
                chart,
                // null: the style of the current values is unknown
                currentStyle:
                    currentStyle === null
                        ? undefined
                        : (currentStyle ?? 'question'),
                onGenerated,
                enabled,
                disabled,
            }),
        { wrapper, initialProps: options },
    );
};

const waitUntilReady = async (result: ReturnType<typeof setup>['result']) =>
    waitFor(() =>
        expect(result.current.getRegenerateProps('name')?.disabled).toBe(false),
    );

const generateRequests = () =>
    mockedLightdashApi.mock.calls
        .map(([request]) => request)
        .filter((request) => request.url.endsWith('/generate-metadata'))
        .map((request) => JSON.parse(request.body as string));

describe('useRegenerateChartMetadata', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(useAmbientAiEnabled).mockReturnValue(true);
        mockedLightdashApi.mockImplementation(async (request) =>
            request.url.endsWith('/generate-metadata')
                ? { title: 'Revenue by Method', description: 'Revenue.' }
                : explore,
        );
    });

    it('is unavailable without ambient AI and loads nothing', () => {
        vi.mocked(useAmbientAiEnabled).mockReturnValue(false);
        const { result } = setup();
        expect(result.current.getRegenerateProps('name')).toBeUndefined();
        expect(sharedLightdashApi).not.toHaveBeenCalled();
    });

    it('loads nothing while the host modal is closed', () => {
        const { result } = setup(vi.fn(), { enabled: false });
        expect(result.current.getRegenerateProps('name')).toBeUndefined();
        expect(sharedLightdashApi).not.toHaveBeenCalled();
    });

    it('sends the next style per field and applies only that field', async () => {
        const onGenerated = vi.fn();
        const { result } = setup(onGenerated);
        await waitFor(() =>
            expect(result.current.getRegenerateProps('name')?.disabled).toBe(
                false,
            ),
        );

        act(() => result.current.getRegenerateProps('name')!.onClick());
        await waitFor(() =>
            expect(onGenerated).toHaveBeenCalledWith(
                'name',
                'Revenue by Method',
            ),
        );
        act(() => result.current.getRegenerateProps('name')!.onClick());
        await waitFor(() => expect(onGenerated).toHaveBeenCalledTimes(2));
        act(() => result.current.getRegenerateProps('description')!.onClick());
        await waitFor(() =>
            expect(onGenerated).toHaveBeenLastCalledWith(
                'description',
                'Revenue.',
            ),
        );

        expect(generateRequests().map((body) => body.style)).toEqual([
            'compact',
            'short',
            // The description cycles on its own
            'compact',
        ]);
        expect(generateRequests()[0]).toMatchObject({
            tableName: chart.tableName,
            metrics: chart.metricQuery.metrics,
        });
    });

    it('restarts the cycle when the host modal reopens', async () => {
        const onGenerated = vi.fn();
        const { result, rerender } = setup(onGenerated, { enabled: true });
        await waitFor(() =>
            expect(result.current.getRegenerateProps('name')?.disabled).toBe(
                false,
            ),
        );
        act(() => result.current.getRegenerateProps('name')!.onClick());
        await waitFor(() => expect(onGenerated).toHaveBeenCalledTimes(1));

        rerender({ enabled: false });
        rerender({ enabled: true });
        act(() => result.current.getRegenerateProps('name')!.onClick());
        await waitFor(() => expect(onGenerated).toHaveBeenCalledTimes(2));

        expect(generateRequests().map((body) => body.style)).toEqual([
            'compact',
            'compact',
        ]);
    });

    it('cancels and discards a request when the host modal closes', async () => {
        let resolveGenerate: (value: unknown) => void = () => {};
        let signal: AbortSignal | undefined;
        mockedLightdashApi.mockImplementation(async (request) => {
            if (!request.url.endsWith('/generate-metadata')) return explore;
            signal = request.signal;
            return new Promise((resolve) => {
                resolveGenerate = resolve;
            });
        });
        const onGenerated = vi.fn();
        const { result, rerender } = setup(onGenerated, { enabled: true });
        await waitUntilReady(result);

        act(() => result.current.getRegenerateProps('name')!.onClick());
        await waitFor(() => expect(signal).toBeDefined());
        rerender({ enabled: false });
        expect(signal!.aborted).toBe(true);

        await act(async () => {
            resolveGenerate({ title: 'Late', description: 'Late' });
        });
        expect(onGenerated).not.toHaveBeenCalled();

        // Reopened, the next click starts the cycle again
        mockedLightdashApi.mockImplementation(async (request) =>
            request.url.endsWith('/generate-metadata')
                ? { title: 'Revenue by Method', description: 'Revenue.' }
                : explore,
        );
        rerender({ enabled: true });
        expect(result.current.loadingField).toBeNull();
        act(() => result.current.getRegenerateProps('name')!.onClick());
        await waitFor(() => expect(onGenerated).toHaveBeenCalledOnce());
        expect(generateRequests().map((body) => body.style)).toEqual([
            'compact',
            'compact',
        ]);
    });

    it('disables the buttons while the host is busy', async () => {
        const { result, rerender } = setup(vi.fn(), { disabled: false });
        await waitUntilReady(result);
        rerender({ disabled: true });
        expect(result.current.getRegenerateProps('name')?.disabled).toBe(true);
        act(() => result.current.getRegenerateProps('name')!.onClick());
        expect(generateRequests()).toEqual([]);
    });

    it('starts the cycle when the current style is unknown', async () => {
        const onGenerated = vi.fn();
        const { result } = setup(onGenerated, { currentStyle: null });
        await waitUntilReady(result);
        act(() => result.current.getRegenerateProps('name')!.onClick());
        await waitFor(() => expect(onGenerated).toHaveBeenCalledOnce());
        expect(generateRequests()[0].style).toBe('question');
    });
});
