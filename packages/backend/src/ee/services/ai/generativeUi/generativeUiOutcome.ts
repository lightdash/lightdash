import {
    assertUnreachable,
    ParameterError,
    type GenerativeUiActionOutcome,
    type GenerativeUiActionSubmission,
    type GenerativeUiCompiledSpec,
    type GenerativeUiState,
    type ToolGenerateUiOutput,
} from '@lightdash/common';

type StepResult = Extract<
    GenerativeUiActionOutcome,
    { status: 'success' }
>['steps'][string];
type StepRequest = StepResult['request'];
type JsonValue = StepResult['responses'][number];
type CompiledStep = GenerativeUiCompiledSpec['steps'][number];

const LIMITS = {
    arrayItems: 20,
    stringLength: 500,
    objectKeys: 50,
    depth: 6,
    stepBytes: 8_192,
    stateArrayItems: 100,
    forEachResponses: 200,
} as const;

const TOO_LARGE = '(response too large)';

type Bounded = { value: JsonValue; truncated: boolean };

// Keeps a response small enough to hand to the model in full.
const boundJson = (value: JsonValue, depth: number): Bounded => {
    if (typeof value === 'string') {
        return value.length > LIMITS.stringLength
            ? {
                  value: `${value.slice(0, LIMITS.stringLength)}…`,
                  truncated: true,
              }
            : { value, truncated: false };
    }
    if (value === null || typeof value !== 'object') {
        return { value, truncated: false };
    }
    if (depth >= LIMITS.depth) return { value: '…', truncated: true };
    if (Array.isArray(value)) {
        const items = value
            .slice(0, LIMITS.arrayItems)
            .map((item) => boundJson(item, depth + 1));
        return {
            value: items.map((item) => item.value),
            truncated:
                value.length > LIMITS.arrayItems ||
                items.some((item) => item.truncated),
        };
    }
    const entries = Object.entries(value);
    const kept = entries
        .slice(0, LIMITS.objectKeys)
        .map(([key, child]) => ({ key, bounded: boundJson(child, depth + 1) }));
    return {
        value: Object.fromEntries(
            kept.map(({ key, bounded }) => [key, bounded.value]),
        ),
        truncated:
            entries.length > LIMITS.objectKeys ||
            kept.some(({ bounded }) => bounded.truncated),
    };
};

const boundState = (state: GenerativeUiState): GenerativeUiState =>
    Object.fromEntries(
        Object.entries(state).map(([key, value]) => {
            if (typeof value === 'string') {
                return [key, value.slice(0, LIMITS.stringLength)];
            }
            if (Array.isArray(value)) {
                return [key, value.slice(0, LIMITS.stateArrayItems)];
            }
            return [key, value];
        }),
    );

const requestOf = ({ operation }: CompiledStep): StepRequest => ({
    operationId: operation.operationId,
    method: operation.method,
    pathTemplate: operation.pathTemplate,
});

const stepResultOf = (
    compiledStep: CompiledStep,
    responses: JsonValue[],
): StepResult => {
    const bounded = responses.map((response) => boundJson(response, 0));
    const values = bounded.map(({ value }) => value);
    const tooLarge = JSON.stringify(values).length > LIMITS.stepBytes;
    return {
        request: requestOf(compiledStep),
        responses: tooLarge ? [TOO_LARGE] : values,
        truncated: tooLarge || bounded.some(({ truncated }) => truncated),
    };
};

const isForEach = ({ step }: CompiledStep) => step.forEach !== undefined;

const expectCount = (
    compiledStep: CompiledStep,
    responses: JsonValue[],
    expected: number | 'any',
) => {
    const { id } = compiledStep.step;
    if (responses.length > LIMITS.forEachResponses) {
        throw new ParameterError(`Step "${id}" reported too many responses`);
    }
    if (expected !== 'any' && responses.length !== expected) {
        throw new ParameterError(
            `Step "${id}" reported ${responses.length} responses; expected ${expected}`,
        );
    }
};

/**
 * Checks what the browser reported against the spec and turns it into the
 * outcome the agent reads. Requests come from the spec's operations, never
 * from the browser, and responses are cut down to a bounded size.
 */
export const buildGenerativeUiOutcome = (
    compiled: GenerativeUiCompiledSpec,
    submission: GenerativeUiActionSubmission,
): GenerativeUiActionOutcome => {
    const state = boundState(submission.state);
    const stepIds = new Set(compiled.steps.map(({ step }) => step.id));

    switch (submission.status) {
        case 'dismissed':
            return { status: 'dismissed', state };
        case 'success': {
            const { responses } = submission;
            Object.keys(responses).forEach((stepId) => {
                if (!stepIds.has(stepId)) {
                    throw new ParameterError(`Unknown step "${stepId}"`);
                }
            });
            return {
                status: 'success',
                state,
                steps: Object.fromEntries(
                    compiled.steps.map((compiledStep) => {
                        const stepResponses =
                            responses[compiledStep.step.id] ?? [];
                        expectCount(
                            compiledStep,
                            stepResponses,
                            isForEach(compiledStep) ? 'any' : 1,
                        );
                        return [
                            compiledStep.step.id,
                            stepResultOf(compiledStep, stepResponses),
                        ];
                    }),
                ),
            };
        }
        case 'failed': {
            const { responses, failure } = submission;
            const failedIndex = compiled.steps.findIndex(
                ({ step }) => step.id === failure.stepId,
            );
            if (failedIndex === -1) {
                throw new ParameterError(`Unknown step "${failure.stepId}"`);
            }
            const failedStep = compiled.steps[failedIndex];
            if (isForEach(failedStep) !== (failure.itemIndex !== null)) {
                throw new ParameterError(
                    `Step "${failure.stepId}" reported the wrong item index`,
                );
            }
            Object.keys(responses).forEach((stepId) => {
                if (!stepIds.has(stepId)) {
                    throw new ParameterError(`Unknown step "${stepId}"`);
                }
            });
            const completed = compiled.steps
                .slice(0, failedIndex + 1)
                .flatMap((compiledStep, index) => {
                    const stepResponses = responses[compiledStep.step.id] ?? [];
                    if (index < failedIndex) {
                        expectCount(
                            compiledStep,
                            stepResponses,
                            isForEach(compiledStep) ? 'any' : 1,
                        );
                    } else {
                        // Items before the failing one already ran.
                        expectCount(
                            compiledStep,
                            stepResponses,
                            failure.itemIndex ?? 0,
                        );
                    }
                    return stepResponses.length === 0 && index === failedIndex
                        ? []
                        : [
                              [
                                  compiledStep.step.id,
                                  stepResultOf(compiledStep, stepResponses),
                              ] satisfies [string, StepResult],
                          ];
                });
            const laterResponses = compiled.steps
                .slice(failedIndex + 1)
                .filter(({ step }) => (responses[step.id] ?? []).length > 0);
            if (laterResponses.length > 0) {
                throw new ParameterError(
                    `Step "${laterResponses[0].step.id}" cannot have run after the failure`,
                );
            }
            return {
                status: 'failed',
                state,
                completed: Object.fromEntries(completed),
                failedStep: {
                    id: failure.stepId,
                    itemIndex: failure.itemIndex,
                    request: requestOf(failedStep),
                    error: {
                        statusCode: failure.error.statusCode,
                        name: failure.error.name.slice(0, LIMITS.stringLength),
                        message: failure.error.message.slice(
                            0,
                            LIMITS.stringLength,
                        ),
                    },
                },
            };
        }
        default:
            return assertUnreachable(submission, 'Unknown submission status');
    }
};

const stepLines = (steps: Record<string, StepResult>): string[] => {
    const lines = Object.entries(steps).map(
        ([id, { request, responses, truncated }]) =>
            `- ${id}: ${request.operationId} (${request.method} ${request.pathTemplate}), ${responses.length} request(s)${truncated ? ', responses shortened' : ''}: ${JSON.stringify(responses)}`,
    );
    return lines.length === 0 ? ['- none'] : lines;
};

/** The text the model reads for an outcome. */
export const renderGenerativeUiOutcome = (
    outcome: GenerativeUiActionOutcome,
): string => {
    const values = `Submitted values: ${JSON.stringify(outcome.state)}`;
    switch (outcome.status) {
        case 'success':
            return [
                'The user ran the card and every step succeeded.',
                values,
                'Steps:',
                ...stepLines(outcome.steps),
            ].join('\n');
        case 'failed': {
            const { id, itemIndex, request, error } = outcome.failedStep;
            const item = itemIndex === null ? '' : ` on item ${itemIndex + 1}`;
            return [
                `The user ran the card and step "${id}" (${request.operationId}) failed${item}: ${error.statusCode} ${error.name}: ${error.message}`,
                values,
                'Requests that ran before the failure:',
                ...stepLines(outcome.completed),
            ].join('\n');
        }
        case 'dismissed':
            return ['The user skipped the card; nothing ran.', values].join(
                '\n',
            );
        default:
            return assertUnreachable(outcome, 'Unknown outcome status');
    }
};

/** The generateUi tool output for a recorded outcome. */
export const toGenerateUiToolOutput = (
    outcome: GenerativeUiActionOutcome,
): ToolGenerateUiOutput => {
    const result = renderGenerativeUiOutcome(outcome);
    switch (outcome.status) {
        case 'success':
            return {
                result,
                metadata: { status: 'success', state: outcome.state },
                structuredContent: outcome,
            };
        case 'failed':
            return {
                result,
                metadata: { status: 'failed', state: outcome.state },
                structuredContent: outcome,
            };
        case 'dismissed':
            return {
                result,
                metadata: { status: 'dismissed', state: outcome.state },
                structuredContent: outcome,
            };
        default:
            return assertUnreachable(outcome, 'Unknown outcome status');
    }
};

/** The generateUi tool output for a problem, with the same text in both fields. */
export const generateUiErrorOutput = (error: string): ToolGenerateUiOutput => ({
    result: error,
    metadata: { status: 'error' },
    structuredContent: { error },
});
