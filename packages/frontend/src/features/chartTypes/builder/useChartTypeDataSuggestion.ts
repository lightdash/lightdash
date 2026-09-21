import {
    type ApiError,
    type ChartTypeDataInputSuggestion,
    type DataAppVizField,
    type DataAppVizFieldMapping,
    type SuggestChartTypeDataRequest,
    type SuggestedChartTypeData,
} from '@lightdash/common';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type MutableRefObject,
} from 'react';
import { useSuggestChartTypeData } from '../../../ee/features/ambientAi/hooks/useSuggestChartTypeData';
import useToaster from '../../../hooks/toaster/useToaster';
import { type VizBuildRequest } from '../hooks/useDataAppVizBuild';
import { type PreviewRunState } from './previewDataTypes';

/** The round on screen: what was asked, and what came back. */
export type ChartTypeDataSuggestionRound = {
    prompt: string;
    /** The build this round is holding back. */
    request: VizBuildRequest;
    /** Null while a request is in flight. */
    data: SuggestedChartTypeData | null;
    /** "Run once and build" is waiting on the query it started. */
    isAwaitingRun: boolean;
};

/** A build the round has released, for the composer to send. */
export type PendingSuggestedBuild = {
    request: VizBuildRequest;
    /** The run behind it returned rows the build can be shown. */
    hasRows: boolean;
};

export type ChartTypeDataSuggestionState = {
    /** "Suggest for me" is what the data pill shows. */
    isSelected: boolean;
    /** Picks it in the data menu; null while Ambient AI is unavailable. */
    onSelect: (() => void) | null;
    /** Another entry in the data menu was picked: the round is dropped and
     *  its prompt handed back, so nothing is silently built or lost. */
    onChooseOtherData: () => void;
    round: ChartTypeDataSuggestionRound | null;
    /** A panel request is in flight; it never opens a round. */
    isSuggestingFields: boolean;
    /** Takes a send before the build starts; false leaves it to the caller. */
    startFromPrompt: (request: VizBuildRequest) => boolean;
    /** Takes composer text as "something else"; false when no round wants it. */
    submitHint: (text: string) => boolean;
    onChooseAlternative: (exploreName: string) => void;
    onUseSampleData: () => void;
    onRunOnceAndBuild: () => void;
    /** Maps the inputs on screen without building; null while unavailable, or
     *  while a round already owns the suggestion. */
    onSuggestFields: (() => void) | null;
    /** The same, for the one input that does not fit. */
    onSuggestInput: ((fieldName: string) => void) | null;
    pendingBuild: PendingSuggestedBuild | null;
    clearPendingBuild: () => void;
};

type AskResult =
    | { status: 'ok'; data: SuggestedChartTypeData }
    | { status: 'failed' }
    /** A newer request on the same path replaced this one. */
    | { status: 'stale' };

const toInferredFields = (
    inputs: ChartTypeDataInputSuggestion[],
): DataAppVizField[] =>
    inputs.map(({ name, label, type, required }) => ({
        name,
        label,
        type,
        required,
    }));

const toFieldMapping = (
    inputs: ChartTypeDataInputSuggestion[],
    declared: DataAppVizField[],
): DataAppVizFieldMapping =>
    inputs.reduce<DataAppVizFieldMapping>((mapping, input) => {
        if (input.fieldId === null) return mapping;
        const field = declared.find(
            (candidate) => candidate.name === input.name,
        );
        mapping[input.name] = field?.multiple ? [input.fieldId] : input.fieldId;
        return mapping;
    }, {});

type Args = {
    projectUuid: string | undefined;
    isAmbientAiEnabled: boolean;
    /** Nothing has been built in this session, so suggesting is the default. */
    isNewChartType: boolean;
    /** Inputs the version on screen declares; empty before a first build. */
    declaredFields: DataAppVizField[];
    /** The preview is on sample data, so no real data is chosen yet. */
    isSampleSelected: boolean;
    /** The explore a panel request stays inside; null searches the project. */
    exploreName: string | null;
    /** What a panel request asks about when no prompt is at hand. */
    fallbackPrompt: string | null;
    run: PreviewRunState;
    onApply: (suggestion: {
        exploreName: string;
        fieldMapping: DataAppVizFieldMapping;
        inferredFields: DataAppVizField[] | null;
    }) => void;
    /** Binds one input, for a suggestion asked about that input alone. */
    onApplyInput: (fieldName: string, fieldId: string) => void;
    onUseSampleData: () => void;
    onRunQuery: () => void;
    /** Puts an abandoned round's prompt back in the composer. */
    onRestorePrompt: (prompt: string) => void;
};

/**
 * The data suggestion round between a prompt and its build.
 *
 * Asking for a suggestion, changing one and every re-ask are metadata-only AI
 * calls. No warehouse query runs until the author asks for one with "Run once
 * and build", and that runs it exactly once through the preview's own run.
 *
 * A round always ends somewhere: it builds, it falls back to sample data, or
 * its prompt goes back to the composer. The panel's own suggestion runs on a
 * separate token so it can never strand one.
 */
export const useChartTypeDataSuggestion = ({
    projectUuid,
    isAmbientAiEnabled,
    isNewChartType,
    declaredFields,
    isSampleSelected,
    exploreName,
    fallbackPrompt,
    run,
    onApply,
    onApplyInput,
    onUseSampleData,
    onRunQuery,
    onRestorePrompt,
}: Args): ChartTypeDataSuggestionState => {
    const { mutateAsync: suggest } = useSuggestChartTypeData();
    const { showToastApiError, showToastInfo } = useToaster();
    // One token per path: only a newer request on the same path may drop an
    // answer, so the panel can never leave the round waiting forever.
    const roundToken = useRef(0);
    const panelToken = useRef(0);
    const [isChosen, setIsChosen] = useState<boolean | null>(null);
    const [round, setRound] = useState<ChartTypeDataSuggestionRound | null>(
        null,
    );
    const [isRoundRequesting, setIsRoundRequesting] = useState(false);
    const [isSuggestingFields, setIsSuggestingFields] = useState(false);
    const [pendingBuild, setPendingBuild] =
        useState<PendingSuggestedBuild | null>(null);

    const isSelected =
        isAmbientAiEnabled && isSampleSelected && (isChosen ?? isNewChartType);

    const inputs = useMemo(
        () => (declaredFields.length > 0 ? declaredFields : null),
        [declaredFields],
    );

    const ask = useCallback(
        async (
            body: SuggestChartTypeDataRequest,
            token: MutableRefObject<number>,
        ): Promise<AskResult> => {
            if (!projectUuid) return { status: 'failed' };
            token.current += 1;
            const asked = token.current;
            try {
                const data = await suggest({ projectUuid, body });
                return asked === token.current
                    ? { status: 'ok', data }
                    : { status: 'stale' };
            } catch (error) {
                if (asked !== token.current) return { status: 'stale' };
                showToastApiError({
                    title: 'Could not suggest data',
                    apiError: (error as ApiError).error,
                });
                return { status: 'failed' };
            }
        },
        [projectUuid, showToastApiError, suggest],
    );

    const apply = useCallback(
        (data: SuggestedChartTypeData) => {
            if (data.kind !== 'suggested') return;
            onApply({
                exploreName: data.exploreName,
                fieldMapping: toFieldMapping(data.inputs, declaredFields),
                inferredFields:
                    declaredFields.length > 0
                        ? null
                        : toInferredFields(data.inputs),
            });
        },
        [declaredFields, onApply],
    );

    /** Ends the round on sample data, so nothing it was holding is lost. */
    const releaseOnSampleData = useCallback(
        (request: VizBuildRequest, keepSuggesting: boolean) => {
            roundToken.current += 1;
            if (!keepSuggesting) setIsChosen(false);
            setRound(null);
            setIsRoundRequesting(false);
            onUseSampleData();
            setPendingBuild({ request, hasRows: false });
        },
        [onUseSampleData],
    );

    const startFromPrompt = useCallback(
        (request: VizBuildRequest): boolean => {
            if (!isSelected || !projectUuid) return false;
            setRound({
                prompt: request.description,
                request,
                data: null,
                isAwaitingRun: false,
            });
            setIsRoundRequesting(true);
            void ask(
                {
                    prompt: request.description,
                    inputs,
                    hint: null,
                    exploreName: null,
                },
                roundToken,
            ).then((result) => {
                // Stale here means a newer round already owns the sheet; every
                // other outcome has to finish this one.
                if (result.status === 'stale') return;
                setIsRoundRequesting(false);
                if (result.status === 'failed') {
                    // This send goes ahead on sample data; the next one can
                    // still be suggested.
                    releaseOnSampleData(request, true);
                    return;
                }
                apply(result.data);
                setRound((current) =>
                    current === null ? null : { ...current, data: result.data },
                );
            });
            return true;
        },
        [apply, ask, inputs, isSelected, projectUuid, releaseOnSampleData],
    );

    /** Asks this round again, with a hint or inside one explore. */
    const reask = useCallback(
        (body: Pick<SuggestChartTypeDataRequest, 'hint' | 'exploreName'>) => {
            if (round === null) return;
            const previous = round.data;
            setRound({ ...round, data: null });
            setIsRoundRequesting(true);
            void ask(
                { prompt: round.prompt, inputs, ...body },
                roundToken,
            ).then((result) => {
                if (result.status === 'stale') return;
                setIsRoundRequesting(false);
                // A failed re-ask leaves the map the author already had.
                const data =
                    result.status === 'failed' ? previous : result.data;
                if (result.status === 'ok') apply(result.data);
                setRound((current) =>
                    current === null ? null : { ...current, data },
                );
            });
        },
        [apply, ask, inputs, round],
    );

    const submitHint = useCallback(
        (text: string): boolean => {
            if (round === null || round.data === null) return false;
            reask({ hint: text, exploreName: null });
            return true;
        },
        [reask, round],
    );

    const onChooseAlternative = useCallback(
        (alternative: string) =>
            reask({ hint: null, exploreName: alternative }),
        [reask],
    );

    const onUseSampleDataInstead = useCallback(() => {
        if (round === null) return;
        releaseOnSampleData(round.request, false);
    }, [releaseOnSampleData, round]);

    const onRunOnceAndBuild = useCallback(() => {
        setRound((current) =>
            current === null ? null : { ...current, isAwaitingRun: true },
        );
        onRunQuery();
    }, [onRunQuery]);

    // The run is what the round waits on; only it can say when the build may
    // start, and with which rows.
    useEffect(() => {
        if (round === null || !round.isAwaitingRun) return;
        if (run.status === 'ready') {
            setRound(null);
            setPendingBuild({
                request: round.request,
                hasRows: run.rowCount > 0,
            });
        } else if (run.status === 'error') {
            setRound({ ...round, isAwaitingRun: false });
        }
    }, [round, run]);

    const panelPrompt = (fallbackPrompt ?? '').trim();
    /** `targetField` narrows the answer to the one input that was asked about;
     *  null takes the whole mapping. */
    const suggestForPanel = useCallback(
        (targetField: string | null) => {
            if (!projectUuid || panelPrompt === '') return;
            setIsSuggestingFields(true);
            void ask(
                { prompt: panelPrompt, inputs, hint: null, exploreName },
                panelToken,
            )
                .then((result) => {
                    if (result.status !== 'ok') return;
                    if (result.data.kind === 'no_data') {
                        showToastInfo({
                            title: 'No data to suggest',
                            subtitle: result.data.reason,
                        });
                        return;
                    }
                    const { data } = result;
                    // Only a suggestion inside the same explore can be applied
                    // to a single input; another explore rebinds everything.
                    if (
                        targetField === null ||
                        data.exploreName !== exploreName
                    ) {
                        apply(data);
                        return;
                    }
                    const suggestedInput = data.inputs.find(
                        (input) => input.name === targetField,
                    );
                    if (suggestedInput?.fieldId) {
                        onApplyInput(targetField, suggestedInput.fieldId);
                        return;
                    }
                    showToastInfo({
                        title: 'No field to suggest',
                        subtitle: `Nothing in ${data.exploreLabel} fits this input.`,
                    });
                })
                .finally(() => setIsSuggestingFields(false));
        },
        [
            apply,
            ask,
            exploreName,
            inputs,
            onApplyInput,
            panelPrompt,
            projectUuid,
            showToastInfo,
        ],
    );

    const onSuggestFields = useCallback(
        () => suggestForPanel(null),
        [suggestForPanel],
    );
    const onSuggestInput = useCallback(
        (fieldName: string) => suggestForPanel(fieldName),
        [suggestForPanel],
    );

    const onSelect = useCallback(() => {
        setIsChosen(true);
        onUseSampleData();
    }, [onUseSampleData]);

    const onChooseOtherData = useCallback(() => {
        setIsChosen(false);
        if (round === null) return;
        // The round is abandoned, not resolved: its prompt goes back to the
        // composer rather than building against data it never saw.
        roundToken.current += 1;
        onRestorePrompt(round.prompt);
        setRound(null);
        setIsRoundRequesting(false);
    }, [onRestorePrompt, round]);

    const clearPendingBuild = useCallback(() => setPendingBuild(null), []);

    // While a round owns the suggestion, the panel, strip and overlay entries
    // stand down: two paths writing one binding is never what the author means.
    const canSuggestFields =
        isAmbientAiEnabled &&
        panelPrompt !== '' &&
        round === null &&
        !isRoundRequesting;

    return {
        isSelected,
        onSelect: isAmbientAiEnabled ? onSelect : null,
        onChooseOtherData,
        round,
        isSuggestingFields,
        startFromPrompt,
        submitHint,
        onChooseAlternative,
        onUseSampleData: onUseSampleDataInstead,
        onRunOnceAndBuild,
        onSuggestFields: canSuggestFields ? onSuggestFields : null,
        onSuggestInput: canSuggestFields ? onSuggestInput : null,
        pendingBuild,
        clearPendingBuild,
    };
};
