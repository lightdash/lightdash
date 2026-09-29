import {
    isApiError,
    parseGenerativeUiRef,
    type GenerativeUiActionSubmission,
    type GenerativeUiCompiledSpec,
    type GenerativeUiState,
} from '@lightdash/common';
import { z } from 'zod';
import { resolveRef, type GenerativeUiBindingContext } from './bindings';
import { buildGenerativeUiRequest, type GenerativeUiFetcher } from './requests';

export type GenerativeUiRunProgress = {
    stepIndex: number;
    stepCount: number;
    itemIndex: number | null;
    itemCount: number | null;
};

type FailedSubmission = Extract<
    GenerativeUiActionSubmission,
    { status: 'failed' }
>;
type StepError = FailedSubmission['failure']['error'];
type JsonValue = FailedSubmission['responses'][string][number];

// Problems found before a request is sent; the server never saw them.
const bindingError = (message: string): StepError => ({
    statusCode: 0,
    name: 'BindingError',
    message,
});

const toStepError = (error: unknown): StepError => {
    if (isApiError(error)) {
        const { statusCode, name, message } = error.error;
        return { statusCode, name, message };
    }
    return {
        statusCode: 0,
        name: 'Error',
        message: error instanceof Error ? error.message : 'The request failed',
    };
};

const toJson = (value: unknown): JsonValue => {
    const parsed = z.json().safeParse(value);
    return parsed.success ? parsed.data : null;
};

/**
 * Runs the action's steps in order as the signed-in user and stops at the
 * first failure. A step's `$result` is its response; a forEach step's is the
 * array of its responses.
 */
export const runGenerativeUiAction = async ({
    compiled,
    state,
    queries,
    fetcher,
    onProgress,
}: {
    compiled: GenerativeUiCompiledSpec;
    state: GenerativeUiState;
    queries: ReadonlyMap<string, unknown>;
    fetcher: GenerativeUiFetcher;
    onProgress: (progress: GenerativeUiRunProgress) => void;
}): Promise<GenerativeUiActionSubmission> => {
    const results = new Map<string, unknown>();
    const responses: Record<string, JsonValue[]> = {};
    const stepCount = compiled.steps.length;
    const contextFor = (
        item: GenerativeUiBindingContext['item'],
    ): GenerativeUiBindingContext => ({ state, queries, results, item });
    const fail = (
        stepId: string,
        itemIndex: number | null,
        error: StepError,
    ): GenerativeUiActionSubmission => ({
        status: 'failed',
        state,
        responses,
        failure: { stepId, itemIndex, error },
    });

    const runStep = async (
        stepIndex: number,
    ): Promise<GenerativeUiActionSubmission> => {
        if (stepIndex >= stepCount)
            return { status: 'success', state, responses };
        const compiledStep = compiled.steps[stepIndex];
        const { step } = compiledStep;
        const stepResponses: JsonValue[] = [];
        responses[step.id] = stepResponses;

        const send = async (
            item: GenerativeUiBindingContext['item'],
        ): Promise<StepError | null> => {
            const built = buildGenerativeUiRequest(
                compiledStep,
                contextFor(item),
            );
            if (!built.ok) return bindingError(built.message);
            try {
                stepResponses.push(toJson(await fetcher(built.request)));
                return null;
            } catch (error) {
                return toStepError(error);
            }
        };

        if (step.forEach === undefined) {
            onProgress({
                stepIndex,
                stepCount,
                itemIndex: null,
                itemCount: null,
            });
            const error = await send(null);
            if (error !== null) return fail(step.id, null, error);
            results.set(step.id, stepResponses[0]);
            return runStep(stepIndex + 1);
        }

        const target = parseGenerativeUiRef(step.forEach);
        const items =
            target === null ? undefined : resolveRef(target, contextFor(null));
        if (!Array.isArray(items)) {
            return fail(
                step.id,
                null,
                bindingError('forEach did not resolve to an array'),
            );
        }
        const elements: unknown[] = items;
        const runItem = async (
            itemIndex: number,
        ): Promise<{ itemIndex: number; error: StepError } | null> => {
            if (itemIndex >= elements.length) return null;
            onProgress({
                stepIndex,
                stepCount,
                itemIndex,
                itemCount: elements.length,
            });
            const error = await send({ value: elements[itemIndex] });
            if (error !== null) return { itemIndex, error };
            return runItem(itemIndex + 1);
        };
        const itemFailure = await runItem(0);
        if (itemFailure !== null) {
            return fail(step.id, itemFailure.itemIndex, itemFailure.error);
        }
        results.set(step.id, stepResponses);
        return runStep(stepIndex + 1);
    };

    return runStep(0);
};
