import {
    assertUnreachable,
    defineTool,
    filtersSchemaTransformed,
    filtersSchemaV2,
    getErrorMessage,
} from '@lightdash/common';
import { generateText, tool } from 'ai';
import isEqual from 'lodash/isEqual';
import { type z } from 'zod';
import { aiCopilotConfigSchema } from '../../../../config/aiConfigSchema';
import { getAiConfig } from '../../../../config/parseConfig';
import { getModel } from '../models';
import { getOpenaiGptmodel } from '../models/openai-gpt';
import { getModelPreset } from '../models/presets';
import {
    fieldCatalog,
    filterPermutationCases,
    filterPermutationGroups,
    type ExpectedFilter,
    type LlmPermutationCase,
} from './filterPermutationCases';

export type FiltersInput = z.infer<typeof filtersSchemaV2>;
type FilterRuleInput = NonNullable<FiltersInput['dimensions']>[number];

const GPT_5_6_LUNA_MODEL_NAME = 'gpt-5.6-luna';
const getLunaFilterPermutationPreset = () => {
    const preset = getModelPreset('openai', GPT_5_6_LUNA_MODEL_NAME);
    if (!preset) {
        throw new Error('GPT-5.6 Luna model preset is required');
    }

    return preset;
};

type FilterPermutationModelOptions = Pick<
    ReturnType<typeof getModel>,
    'callOptions' | 'model' | 'providerOptions'
>;
export type FilterPermutationToolSchemaMode = 'strict' | 'unstrict';
export type FilterPermutationProvider = 'openai' | 'anthropic';
export type FilterPermutationModelConfig =
    | {
          label: string;
          provider: 'openai';
          modelName: typeof GPT_5_6_LUNA_MODEL_NAME;
          requiredEnvVar: string;
      }
    | {
          label: string;
          provider: 'anthropic';
          modelName: string;
          requiredEnvVar: string;
      };

type FilterPermutationModelConfigs = {
    [Provider in FilterPermutationProvider]: Extract<
        FilterPermutationModelConfig,
        { provider: Provider }
    >;
};

export type FilterPermutationAttemptResult = {
    attempt: number;
    errors: string[];
    filters: FiltersInput | null;
    text: string;
};

export type FilterPermutationModelStepResult = {
    step: number;
    finishReason: string;
    rawFinishReason: string | null;
    text: string;
    toolCallCount: number;
    toolResultCount: number;
    content: string;
    toolCalls: string;
    toolResults: string;
};

export type FilterPermutationResult = {
    caseId: string;
    permutation: string;
    prompt: string;
    ok: boolean;
    errors: string[];
    filters: FiltersInput | null;
    text: string;
    attempts: number;
    retries: number;
    maxAttempts: number;
    modelSteps: number;
    attemptResults: FilterPermutationAttemptResult[];
    modelStepResults: FilterPermutationModelStepResult[];
};

export const MAX_FILTER_PERMUTATION_ATTEMPTS = 3;

export const filterPermutationModelConfigs = {
    openai: {
        label: 'OpenAI GPT-5.6 Luna',
        provider: 'openai',
        modelName: GPT_5_6_LUNA_MODEL_NAME,
        requiredEnvVar: 'OPENAI_API_KEY',
    },
    anthropic: {
        label: 'Anthropic Claude Haiku 4.5',
        provider: 'anthropic',
        modelName: 'claude-haiku-4-5',
        requiredEnvVar: 'ANTHROPIC_API_KEY',
    },
} as const satisfies FilterPermutationModelConfigs;

const TODAY = new Date().toISOString();

const fieldCatalogText = Object.entries(fieldCatalog)
    .map(
        ([fieldId, field]) =>
            `- ${fieldId}: label="${field.label}", fieldType=${field.fieldType}, fieldFilterType=${field.fieldFilterType}`,
    )
    .join('\n');

const generateFiltersInputSchema = defineTool({
    name: 'generateFilters',
    title: 'Generate filters',
    description:
        'Generate the final Lightdash filters object. The input must match the Lightdash AI filters schema.',
    availability: ['agent'],
    inputSchema: filtersSchemaV2,
}).for('agent').inputSchema;

const systemPrompt = `You are a Lightdash metric-query filter builder.

Given a user request, call generateFilters with a complete filters object:
{
  type: "and",
  dimensions: [exactly one filter rule],
  metrics: null,
  tableCalculations: null
}

Today is ${TODAY}.

Available fields:
${fieldCatalogText}

Rules:
- If generateFilters returns errors, call generateFilters again with corrected filters until it passes or no retries remain.
- Put the generated filter rule in dimensions.
- Use field IDs exactly as listed above.
- Use fieldType and fieldFilterType exactly as listed above for the chosen field.
- Use the requested operator exactly.
- Use the requested values exactly when provided.
- Use the requested settings exactly when provided.
- For boolean negation, keep the named value and put negation in the operator: "not true" means operator="notEquals" with values=[true]; "not false" means operator="notEquals" with values=[false].
- Never flip boolean values to represent negation.
- For isNull/notNull operators, omit values and settings entirely.
- Never encode null, missing, or present checks as equals/notEquals/include with values like "null", "missing", "", or true.
- Do not add extra filters.
- Do not use natural-language phrases as values.
- Use ISO dates/datetimes for explicit date values.`;

const getProviderOptions = (
    providerOptions: FilterPermutationModelOptions['providerOptions'],
): FilterPermutationModelOptions['providerOptions'] => {
    if (!providerOptions || !('openai' in providerOptions)) {
        return providerOptions;
    }

    const openaiOptions = { ...providerOptions.openai };
    delete openaiOptions.reasoningSummary;

    return {
        ...providerOptions,
        openai: {
            ...openaiOptions,
            parallelToolCalls: false,
        },
    };
};

const hasProperty = <TProperty extends string>(
    value: unknown,
    property: TProperty,
): value is Record<TProperty, unknown> =>
    typeof value === 'object' && value !== null && property in value;

const getRuleValues = (rule: FilterRuleInput): unknown[] =>
    hasProperty(rule, 'values') && Array.isArray(rule.values)
        ? rule.values
        : [];

const getRuleSettings = (
    rule: FilterRuleInput,
): Record<string, unknown> | undefined =>
    hasProperty(rule, 'settings') &&
    typeof rule.settings === 'object' &&
    rule.settings !== null
        ? rule.settings
        : undefined;

const valuesEqual = (actual: unknown, expected: unknown): boolean =>
    isEqual(actual, expected);

const stringifyJson = (value: unknown): string =>
    JSON.stringify(value) ?? 'undefined';

export const summarizeRule = (rule: FilterRuleInput): string =>
    JSON.stringify({
        fieldId: rule.fieldId,
        fieldType: rule.fieldType,
        fieldFilterType: rule.fieldFilterType,
        operator: rule.operator,
        values: getRuleValues(rule),
        settings: getRuleSettings(rule),
    });

const validateExpectedFilter = (
    rule: FilterRuleInput,
    expected: ExpectedFilter,
): string[] => {
    const errors: string[] = [];

    if (rule.fieldId !== expected.fieldId) {
        errors.push(
            `used fieldId=${rule.fieldId}; expected ${expected.fieldId}`,
        );
    }
    if (rule.fieldType !== expected.fieldType) {
        errors.push(
            `used fieldType=${rule.fieldType}; expected ${expected.fieldType}`,
        );
    }
    if (rule.fieldFilterType !== expected.fieldFilterType) {
        errors.push(
            `used fieldFilterType=${rule.fieldFilterType}; expected ${expected.fieldFilterType}`,
        );
    }
    if (rule.operator !== expected.operator) {
        errors.push(
            `used operator=${rule.operator}; expected ${expected.operator}`,
        );
    }

    const actualValues = getRuleValues(rule);
    const expectedValues = expected.values ?? [];
    if (!valuesEqual(actualValues, expectedValues)) {
        errors.push(
            `used values=${JSON.stringify(actualValues)}; expected ${JSON.stringify(expectedValues)}`,
        );
    }

    const actualSettings = getRuleSettings(rule);
    if (expected.settings) {
        if (!valuesEqual(actualSettings, expected.settings)) {
            errors.push(
                `used settings=${JSON.stringify(actualSettings)}; expected ${JSON.stringify(expected.settings)}`,
            );
        }
    } else if (actualSettings !== undefined) {
        errors.push(
            `used settings=${JSON.stringify(actualSettings)}; expected settings omitted`,
        );
    }

    return errors;
};

const validateTransformedFilters = (
    filters: FiltersInput,
    expected: ExpectedFilter,
): string[] => {
    const transformed = filtersSchemaTransformed.parse(filters);
    const { dimensions } = transformed;
    const errors: string[] = [];

    if (!dimensions) {
        return ['transformed filters missing dimensions group'];
    }

    const dimensionItems = 'and' in dimensions ? dimensions.and : dimensions.or;
    const transformedRule = dimensionItems[0];

    if (!transformedRule || !hasProperty(transformedRule, 'target')) {
        return ['transformed filter missing first dimension rule'];
    }

    const { target } = transformedRule;
    if (!hasProperty(target, 'fieldId')) {
        errors.push('transformed target missing fieldId');
    } else if (target.fieldId !== expected.fieldId) {
        errors.push(
            `transformed target.fieldId=${String(target.fieldId)}; expected ${expected.fieldId}`,
        );
    }

    if (!hasProperty(target, 'fieldFilterType')) {
        errors.push('transformed target missing fieldFilterType');
    } else if (target.fieldFilterType !== expected.fieldFilterType) {
        errors.push(
            `transformed target.fieldFilterType=${String(target.fieldFilterType)}; expected ${expected.fieldFilterType}`,
        );
    }

    if (!hasProperty(transformedRule, 'id')) {
        errors.push('transformed rule missing id');
    }
    if (!hasProperty(transformedRule, 'operator')) {
        errors.push('transformed rule missing operator');
    } else if (transformedRule.operator !== expected.operator) {
        errors.push(
            `transformed operator=${String(transformedRule.operator)}; expected ${expected.operator}`,
        );
    }

    const expectedValues = expected.values ?? [];
    const actualValues = hasProperty(transformedRule, 'values')
        ? transformedRule.values
        : [];
    if (!valuesEqual(actualValues, expectedValues)) {
        errors.push(
            `transformed values=${JSON.stringify(actualValues)}; expected ${JSON.stringify(expectedValues)}`,
        );
    }

    const actualSettings = hasProperty(transformedRule, 'settings')
        ? transformedRule.settings
        : undefined;
    if (expected.settings) {
        if (!valuesEqual(actualSettings, expected.settings)) {
            errors.push(
                `transformed settings=${JSON.stringify(actualSettings)}; expected ${JSON.stringify(expected.settings)}`,
            );
        }
    } else if (actualSettings !== undefined) {
        errors.push(
            `transformed settings=${JSON.stringify(actualSettings)}; expected settings omitted`,
        );
    }

    return errors;
};

const validateSubmittedFilters = ({
    filters,
    expected,
}: {
    filters: FiltersInput;
    expected: ExpectedFilter;
}): { errors: string[]; filters: FiltersInput } => {
    const errors: string[] = [];
    const schemaParse = filtersSchemaV2.safeParse(filters);
    if (!schemaParse.success) {
        return {
            errors: [`filtersSchemaV2 failed: ${schemaParse.error.message}`],
            filters,
        };
    }

    const rules = schemaParse.data.dimensions ?? [];
    if (rules.length !== 1) {
        errors.push(`emitted ${rules.length} dimension filters; expected 1`);
    }

    const rule = rules[0];
    if (!rule) {
        errors.push('missing first dimension filter');
    } else {
        errors.push(...validateExpectedFilter(rule, expected));
    }

    try {
        errors.push(...validateTransformedFilters(schemaParse.data, expected));
    } catch (error) {
        errors.push(
            `filtersSchemaTransformed failed: ${getErrorMessage(error)}`,
        );
    }

    return { errors, filters: schemaParse.data };
};

export const isFilterPermutationModelConfigured = (
    modelConfig: FilterPermutationModelConfig,
): boolean => Boolean(process.env[modelConfig.requiredEnvVar]);

export const getFilterPermutationModelOptions = (
    modelConfig: FilterPermutationModelConfig = filterPermutationModelConfigs.openai,
): FilterPermutationModelOptions => {
    const config = aiCopilotConfigSchema.parse(getAiConfig());

    switch (modelConfig.provider) {
        case 'openai': {
            const providerConfig = config.providers.openai;
            if (!providerConfig) {
                throw new Error(
                    `${modelConfig.label} is not configured. Set existing ${modelConfig.requiredEnvVar}.`,
                );
            }

            return getOpenaiGptmodel(
                providerConfig,
                getLunaFilterPermutationPreset(),
                { enableReasoning: false },
            );
        }
        case 'anthropic': {
            if (!config.providers.anthropic) {
                throw new Error(
                    `${modelConfig.label} is not configured. Set existing ${modelConfig.requiredEnvVar}.`,
                );
            }

            return getModel(config, {
                provider: modelConfig.provider,
                modelName: modelConfig.modelName,
                enableReasoning: false,
            });
        }
        default:
            return assertUnreachable(
                modelConfig,
                'Unknown filter permutation provider',
            );
    }
};

export const runLlmFilterPermutationCase = async ({
    probeCase,
    modelOptions,
    toolSchemaMode = 'strict',
}: {
    probeCase: LlmPermutationCase;
    modelOptions: FilterPermutationModelOptions;
    toolSchemaMode?: FilterPermutationToolSchemaMode;
}): Promise<FilterPermutationResult> => {
    const attemptResults: FilterPermutationAttemptResult[] = [];
    const modelStepResults: FilterPermutationModelStepResult[] = [];
    let submittedFilters: FiltersInput | null = null;
    let lastAttemptErrors = ['model did not call generateFilters'];
    let toolCallCount = 0;

    try {
        const result = await generateText({
            ...modelOptions.callOptions,
            providerOptions: getProviderOptions(modelOptions.providerOptions),
            model: modelOptions.model,
            maxRetries: 0,
            stopWhen: ({ steps }) =>
                lastAttemptErrors.length === 0 ||
                attemptResults.length >= MAX_FILTER_PERMUTATION_ATTEMPTS ||
                steps.length >= MAX_FILTER_PERMUTATION_ATTEMPTS,
            toolChoice: { type: 'tool', toolName: 'generateFilters' },
            prepareStep: () => ({
                activeTools: ['generateFilters'],
                toolChoice: { type: 'tool', toolName: 'generateFilters' },
            }),
            onStepFinish: (step) => {
                modelStepResults.push({
                    step: step.stepNumber + 1,
                    finishReason: step.finishReason,
                    rawFinishReason: step.rawFinishReason ?? null,
                    text: step.text,
                    toolCallCount: step.toolCalls.length,
                    toolResultCount: step.toolResults.length,
                    content: stringifyJson(step.content),
                    toolCalls: stringifyJson(step.toolCalls),
                    toolResults: stringifyJson(step.toolResults),
                });
            },
            system: systemPrompt,
            tools: {
                generateFilters: tool({
                    description:
                        'Generate the final Lightdash filters object. The input must match the Lightdash AI filters schema. If the tool returns errors, call generateFilters again with corrected filters.',
                    inputSchema: generateFiltersInputSchema,
                    strict: toolSchemaMode === 'strict',
                    execute: async (input) => {
                        toolCallCount += 1;
                        submittedFilters = input;
                        const validation = validateSubmittedFilters({
                            filters: input,
                            expected: probeCase.expected,
                        });
                        const attemptResult: FilterPermutationAttemptResult = {
                            attempt: toolCallCount,
                            errors: validation.errors,
                            filters: validation.filters,
                            text: '',
                        };

                        attemptResults.push(attemptResult);
                        lastAttemptErrors = validation.errors;

                        if (validation.errors.length === 0) {
                            return { ok: true };
                        }

                        return {
                            ok: false,
                            errors: validation.errors,
                            submittedFilters: validation.filters,
                            retryInstruction:
                                toolCallCount < MAX_FILTER_PERMUTATION_ATTEMPTS
                                    ? 'Call generateFilters again with corrected filters.'
                                    : 'No retries remain.',
                        };
                    },
                }),
            },
            messages: [{ role: 'user', content: probeCase.prompt }],
        });

        const lastAttempt = attemptResults[attemptResults.length - 1];
        const attempts = attemptResults.length;
        const errors = lastAttempt?.errors ?? [
            'model did not call generateFilters',
        ];
        const filters = lastAttempt?.filters ?? submittedFilters;

        return {
            caseId: probeCase.id,
            permutation: probeCase.permutation,
            prompt: probeCase.prompt,
            ok: errors.length === 0,
            errors,
            filters,
            text: result.text,
            attempts,
            retries: Math.max(0, attempts - 1),
            maxAttempts: MAX_FILTER_PERMUTATION_ATTEMPTS,
            modelSteps: result.steps.length,
            attemptResults,
            modelStepResults,
        };
    } catch (error) {
        const attempts = attemptResults.length;
        return {
            caseId: probeCase.id,
            permutation: probeCase.permutation,
            prompt: probeCase.prompt,
            ok: false,
            errors: [getErrorMessage(error)],
            filters: submittedFilters,
            text: '',
            attempts,
            retries: Math.max(0, attempts - 1),
            maxAttempts: MAX_FILTER_PERMUTATION_ATTEMPTS,
            modelSteps: modelStepResults.length,
            attemptResults,
            modelStepResults,
        };
    }
};

export const formatFilterPermutationResult = (
    result: FilterPermutationResult,
): string => {
    const lines = [
        `[${result.ok ? 'PASS' : 'FAIL'}] ${result.caseId}`,
        `Permutation: ${result.permutation}`,
        `Prompt: ${result.prompt}`,
        `Tool attempts: ${result.attempts}/${result.maxAttempts} (retries used: ${result.retries}, model steps: ${result.modelSteps})`,
    ];

    if (result.errors.length > 0) {
        lines.push(`Errors:\n- ${result.errors.join('\n- ')}`);
    }
    if (result.modelStepResults.length > 0) {
        lines.push('Model steps:');
        result.modelStepResults.forEach((step) => {
            lines.push(
                `- step ${step.step}: finish=${step.finishReason} raw=${step.rawFinishReason} toolCalls=${step.toolCallCount} toolResults=${step.toolResultCount}`,
            );
            if (step.text) {
                lines.push(`  text: ${step.text}`);
            }
            lines.push(`  content: ${step.content}`);
            lines.push(`  toolCalls: ${step.toolCalls}`);
            lines.push(`  toolResults: ${step.toolResults}`);
        });
    }
    if (result.filters) {
        lines.push(`Filters: ${JSON.stringify(result.filters)}`);
        const firstRule = result.filters.dimensions?.[0];
        if (firstRule) {
            lines.push(`Rule: ${summarizeRule(firstRule)}`);
        }
    }
    if (result.attemptResults.length > 1) {
        lines.push(
            `Attempt history:\n${result.attemptResults
                .map(
                    (attemptResult) =>
                        `Attempt ${attemptResult.attempt}: ${attemptResult.errors.length === 0 ? 'passed' : attemptResult.errors.join('; ')}`,
                )
                .join('\n')}`,
        );
    }
    if (result.text.trim()) {
        lines.push(`Text: ${result.text.trim()}`);
    }

    return lines.join('\n');
};

export { filterPermutationCases, filterPermutationGroups };
