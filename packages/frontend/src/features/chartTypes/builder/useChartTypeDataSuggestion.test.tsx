import {
    type DataAppVizField,
    type SuggestedChartTypeData,
} from '@lightdash/common';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type VizBuildRequest } from '../hooks/useDataAppVizBuild';
import { type PreviewRunState } from './previewDataTypes';
import { useChartTypeDataSuggestion } from './useChartTypeDataSuggestion';

const { suggest, showToastApiError, showToastInfo } = vi.hoisted(() => ({
    suggest: vi.fn(),
    showToastApiError: vi.fn(),
    showToastInfo: vi.fn(),
}));

vi.mock('../../../ee/features/ambientAi/hooks/useSuggestChartTypeData', () => ({
    useSuggestChartTypeData: () => ({ mutateAsync: suggest }),
}));
vi.mock('../../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastApiError, showToastInfo }),
}));

const NOT_RUN: PreviewRunState = { status: 'notRun' };
const READY: PreviewRunState = {
    status: 'ready',
    rows: [{}, {}],
    itemsMap: {},
    pivotDetails: null,
    rowCount: 2,
    ranAt: new Date(),
};

const declaredFields: DataAppVizField[] = [
    { name: 'source', label: 'Source', type: 'dimension', required: true },
    { name: 'value', label: 'Value', type: 'metric', required: true },
];

const buildRequest: VizBuildRequest = {
    description: 'A Sankey of channel to plan',
    fileIds: [],
    clarifications: [],
    externalConnections: [],
    claudeModel: 'opus',
};

const suggested: SuggestedChartTypeData = {
    kind: 'suggested',
    exploreName: 'customers',
    exploreLabel: 'Customers',
    shapeSummary: 'A Sankey needs one row per pair.',
    fits: true,
    alternatives: [],
    inputs: [
        {
            name: 'source',
            label: 'Source',
            type: 'dimension',
            required: true,
            fieldId: 'customers_channel',
            fieldLabel: 'Acquisition channel',
            fieldType: 'dimension',
            reason: 'Matches acquisition channel',
        },
        {
            name: 'value',
            label: 'Value',
            type: 'metric',
            required: true,
            fieldId: 'customers_count',
            fieldLabel: 'Unique customer count',
            fieldType: 'metric',
            reason: 'Counts customers per pair',
        },
    ],
};

const renderSuggestion = ({
    fields = [] as DataAppVizField[],
    isAmbientAiEnabled = true,
    isSampleSelected = true,
    exploreName = null as string | null,
    noPrompt = false,
} = {}) => {
    const onApply = vi.fn();
    const onApplyInput = vi.fn();
    const onUseSampleData = vi.fn();
    const onRunQuery = vi.fn();
    const onRestorePrompt = vi.fn();
    const view = renderHook(
        ({ run }: { run: PreviewRunState }) =>
            useChartTypeDataSuggestion({
                projectUuid: 'p1',
                isAmbientAiEnabled,
                isNewChartType: true,
                declaredFields: fields,
                isSampleSelected,
                exploreName,
                fallbackPrompt: noPrompt ? null : 'Customer flow Sankey',
                run,
                onApply,
                onApplyInput,
                onUseSampleData,
                onRunQuery,
                onRestorePrompt,
            }),
        { initialProps: { run: NOT_RUN } as { run: PreviewRunState } },
    );
    return {
        ...view,
        onApply,
        onApplyInput,
        onUseSampleData,
        onRunQuery,
        onRestorePrompt,
    };
};

describe('useChartTypeDataSuggestion', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        suggest.mockResolvedValue(suggested);
    });

    it('asks with every key the endpoint requires, and runs nothing', async () => {
        const { result, onRunQuery } = renderSuggestion();

        act(() => {
            expect(result.current.startFromPrompt(buildRequest)).toBe(true);
        });

        await waitFor(() =>
            expect(result.current.round?.data).toEqual(suggested),
        );
        expect(suggest).toHaveBeenCalledWith({
            projectUuid: 'p1',
            body: {
                prompt: 'A Sankey of channel to plan',
                inputs: null,
                hint: null,
                exploreName: null,
            },
        });
        expect(onRunQuery).not.toHaveBeenCalled();
    });

    it('sends the inputs the version on screen declares', async () => {
        const { result } = renderSuggestion({ fields: declaredFields });

        act(() => {
            result.current.startFromPrompt(buildRequest);
        });

        await waitFor(() => expect(suggest).toHaveBeenCalledTimes(1));
        expect(suggest.mock.calls[0][0].body.inputs).toEqual(declaredFields);
    });

    it('binds the suggested explore and fields to the preview', async () => {
        const { result, onApply } = renderSuggestion();

        act(() => {
            result.current.startFromPrompt(buildRequest);
        });

        await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
        expect(onApply).toHaveBeenCalledWith({
            exploreName: 'customers',
            fieldMapping: {
                source: 'customers_channel',
                value: 'customers_count',
            },
            inferredFields: [
                {
                    name: 'source',
                    label: 'Source',
                    type: 'dimension',
                    required: true,
                },
                {
                    name: 'value',
                    label: 'Value',
                    type: 'metric',
                    required: true,
                },
            ],
        });
    });

    it('keeps an unmatched input out of the binding', async () => {
        suggest.mockResolvedValue({
            ...suggested,
            fits: false,
            inputs: [
                { ...suggested.inputs[0] },
                {
                    ...suggested.inputs[1],
                    fieldId: null,
                    fieldLabel: null,
                    fieldType: null,
                    reason: 'No count in this explore',
                },
            ],
        } satisfies SuggestedChartTypeData);
        const { result, onApply } = renderSuggestion();

        act(() => {
            result.current.startFromPrompt(buildRequest);
        });

        await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
        expect(onApply.mock.calls[0][0].fieldMapping).toEqual({
            source: 'customers_channel',
        });
    });

    it('drops an answer a newer request has replaced', async () => {
        let resolveFirst: (data: SuggestedChartTypeData) => void = () => {};
        suggest.mockImplementationOnce(
            () =>
                new Promise<SuggestedChartTypeData>((resolve) => {
                    resolveFirst = resolve;
                }),
        );
        const second: SuggestedChartTypeData = {
            ...suggested,
            exploreName: 'orders',
            exploreLabel: 'Orders',
        };
        suggest.mockResolvedValueOnce(second);
        const { result, onApply } = renderSuggestion();

        act(() => {
            result.current.startFromPrompt(buildRequest);
        });
        act(() => {
            result.current.startFromPrompt(buildRequest);
        });
        await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
        act(() => resolveFirst(suggested));

        await waitFor(() => expect(result.current.round?.data).toEqual(second));
        expect(onApply).toHaveBeenCalledTimes(1);
        expect(onApply.mock.calls[0][0].exploreName).toBe('orders');
    });

    it('falls back to sample data and lets the build through when the request fails', async () => {
        suggest.mockRejectedValue({ error: { message: 'Forbidden' } });
        const { result, onUseSampleData } = renderSuggestion();

        act(() => {
            result.current.startFromPrompt(buildRequest);
        });

        await waitFor(() =>
            expect(result.current.pendingBuild).toEqual({
                request: buildRequest,
                hasRows: false,
            }),
        );
        expect(onUseSampleData).toHaveBeenCalledTimes(1);
        expect(result.current.round).toBeNull();
        expect(showToastApiError).toHaveBeenCalledTimes(1);
    });

    it('runs the query once, then releases the build with its rows', async () => {
        const { result, rerender, onRunQuery } = renderSuggestion();
        act(() => {
            result.current.startFromPrompt(buildRequest);
        });
        await waitFor(() => expect(result.current.round?.data).toBeTruthy());

        act(() => result.current.onRunOnceAndBuild());
        expect(onRunQuery).toHaveBeenCalledTimes(1);
        expect(result.current.pendingBuild).toBeNull();

        rerender({ run: READY });

        await waitFor(() =>
            expect(result.current.pendingBuild).toEqual({
                request: buildRequest,
                hasRows: true,
            }),
        );
        expect(result.current.round).toBeNull();
        expect(onRunQuery).toHaveBeenCalledTimes(1);
    });

    it('keeps the round open when the run fails', async () => {
        const { result, rerender } = renderSuggestion();
        act(() => {
            result.current.startFromPrompt(buildRequest);
        });
        await waitFor(() => expect(result.current.round?.data).toBeTruthy());
        act(() => result.current.onRunOnceAndBuild());

        rerender({ run: { status: 'error', message: 'Query failed' } });

        await waitFor(() =>
            expect(result.current.round?.isAwaitingRun).toBe(false),
        );
        expect(result.current.pendingBuild).toBeNull();
    });

    it('takes "something else" as a hint on the same prompt, and builds nothing', async () => {
        const { result, onRunQuery } = renderSuggestion();
        act(() => {
            result.current.startFromPrompt(buildRequest);
        });
        await waitFor(() => expect(result.current.round?.data).toBeTruthy());

        act(() => {
            expect(result.current.submitHint('Use orders instead')).toBe(true);
        });

        await waitFor(() => expect(suggest).toHaveBeenCalledTimes(2));
        expect(suggest.mock.calls[1][0].body).toEqual({
            prompt: 'A Sankey of channel to plan',
            inputs: null,
            hint: 'Use orders instead',
            exploreName: null,
        });
        expect(result.current.pendingBuild).toBeNull();
        expect(onRunQuery).not.toHaveBeenCalled();
    });

    it('asks again inside an explore that was also considered', async () => {
        const { result, onRunQuery } = renderSuggestion();
        act(() => {
            result.current.startFromPrompt(buildRequest);
        });
        await waitFor(() => expect(result.current.round?.data).toBeTruthy());

        act(() => result.current.onChooseAlternative('orders'));

        await waitFor(() => expect(suggest).toHaveBeenCalledTimes(2));
        expect(suggest.mock.calls[1][0].body).toEqual({
            prompt: 'A Sankey of channel to plan',
            inputs: null,
            hint: null,
            exploreName: 'orders',
        });
        expect(onRunQuery).not.toHaveBeenCalled();
    });

    it('takes the build to sample data when the author asks for it', async () => {
        const { result, onUseSampleData } = renderSuggestion();
        act(() => {
            result.current.startFromPrompt(buildRequest);
        });
        await waitFor(() => expect(result.current.round?.data).toBeTruthy());

        act(() => result.current.onUseSampleData());

        expect(onUseSampleData).toHaveBeenCalledTimes(1);
        expect(result.current.round).toBeNull();
        expect(result.current.pendingBuild).toEqual({
            request: buildRequest,
            hasRows: false,
        });
    });

    it('maps the declared inputs without building or running', async () => {
        const { result, onApply, onRunQuery } = renderSuggestion({
            fields: declaredFields,
            isSampleSelected: false,
            exploreName: 'customers',
        });

        act(() => result.current.onSuggestFields?.());

        await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
        expect(suggest.mock.calls[0][0].body).toEqual({
            prompt: 'Customer flow Sankey',
            inputs: declaredFields,
            hint: null,
            exploreName: 'customers',
        });
        expect(onApply.mock.calls[0][0].inferredFields).toBeNull();
        expect(result.current.round).toBeNull();
        expect(result.current.pendingBuild).toBeNull();
        expect(onRunQuery).not.toHaveBeenCalled();
    });

    it('says why nothing could be suggested for the inputs on screen', async () => {
        suggest.mockResolvedValue({
            kind: 'no_data',
            reason: 'No explore has a customer count.',
        } satisfies SuggestedChartTypeData);
        const { result, onApply } = renderSuggestion({
            fields: declaredFields,
        });

        act(() => result.current.onSuggestFields?.());

        await waitFor(() => expect(showToastInfo).toHaveBeenCalledTimes(1));
        expect(onApply).not.toHaveBeenCalled();
    });

    it('offers nothing and asks for nothing without Ambient AI', () => {
        const { result } = renderSuggestion({ isAmbientAiEnabled: false });

        expect(result.current.onSelect).toBeNull();
        expect(result.current.onSuggestFields).toBeNull();
        expect(result.current.isSelected).toBe(false);
        act(() => {
            expect(result.current.startFromPrompt(buildRequest)).toBe(false);
        });
        expect(suggest).not.toHaveBeenCalled();
    });

    it('leaves the send alone once other data is selected', () => {
        const { result } = renderSuggestion({ isSampleSelected: false });

        act(() => {
            expect(result.current.startFromPrompt(buildRequest)).toBe(false);
        });
        expect(suggest).not.toHaveBeenCalled();
    });

    it('cannot be stranded by a panel suggestion asked mid-round', async () => {
        let resolveRound: (data: SuggestedChartTypeData) => void = () => {};
        suggest.mockImplementationOnce(
            () =>
                new Promise<SuggestedChartTypeData>((resolve) => {
                    resolveRound = resolve;
                }),
        );
        const { result } = renderSuggestion({ fields: declaredFields });
        act(() => {
            result.current.startFromPrompt(buildRequest);
        });

        // The panel stands down while a round owns the suggestion, and even a
        // request that slipped through cannot drop the round's own answer.
        expect(result.current.onSuggestFields).toBeNull();
        expect(result.current.onSuggestInput).toBeNull();
        act(() => resolveRound(suggested));

        await waitFor(() =>
            expect(result.current.round?.data).toEqual(suggested),
        );
    });

    it('resolves the round even when its request fails mid-flight', async () => {
        suggest.mockRejectedValue({ error: { message: 'Forbidden' } });
        const { result } = renderSuggestion();

        act(() => {
            result.current.startFromPrompt(buildRequest);
        });

        await waitFor(() => expect(result.current.pendingBuild).toBeTruthy());
        expect(result.current.round).toBeNull();
        // Suggesting stays selected: the fallback covers this send only.
        expect(result.current.isSelected).toBe(true);
    });

    it('hands the prompt back when other data is picked mid-round', async () => {
        const { result, onRestorePrompt } = renderSuggestion();
        act(() => {
            result.current.startFromPrompt(buildRequest);
        });
        await waitFor(() => expect(result.current.round?.data).toBeTruthy());

        act(() => result.current.onChooseOtherData());

        expect(onRestorePrompt).toHaveBeenCalledWith(
            'A Sankey of channel to plan',
        );
        expect(result.current.round).toBeNull();
        expect(result.current.pendingBuild).toBeNull();
        expect(result.current.isSelected).toBe(false);
    });

    it('stops spinning the panel action however its request ends', async () => {
        suggest.mockRejectedValue({ error: { message: 'Forbidden' } });
        const { result } = renderSuggestion({ fields: declaredFields });

        act(() => result.current.onSuggestFields?.());

        await waitFor(() =>
            expect(result.current.isSuggestingFields).toBe(false),
        );
    });

    it('binds only the input a per-input suggestion was asked about', async () => {
        const { result, onApply, onApplyInput } = renderSuggestion({
            fields: declaredFields,
            isSampleSelected: false,
            exploreName: 'customers',
        });

        act(() => result.current.onSuggestInput?.('value'));

        await waitFor(() => expect(onApplyInput).toHaveBeenCalledTimes(1));
        expect(onApplyInput).toHaveBeenCalledWith('value', 'customers_count');
        expect(onApply).not.toHaveBeenCalled();
    });

    it('rebinds everything when the suggestion leaves the explore', async () => {
        suggest.mockResolvedValue({
            ...suggested,
            exploreName: 'orders',
            exploreLabel: 'Orders',
        } satisfies SuggestedChartTypeData);
        const { result, onApply, onApplyInput } = renderSuggestion({
            fields: declaredFields,
            isSampleSelected: false,
            exploreName: 'customers',
        });

        act(() => result.current.onSuggestInput?.('value'));

        await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
        expect(onApplyInput).not.toHaveBeenCalled();
    });

    it('asks for nothing when there is no prompt to ask about', () => {
        const { result } = renderSuggestion({ noPrompt: true });

        expect(result.current.onSuggestFields).toBeNull();
        expect(result.current.onSuggestInput).toBeNull();
        expect(suggest).not.toHaveBeenCalled();
    });
});
