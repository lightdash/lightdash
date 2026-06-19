import {
    defineTool,
    filtersSchemaTransformed,
    filtersSchemaV2,
    getErrorMessage,
} from '@lightdash/common';
import { generateText, stepCountIs, tool, type JSONValue } from 'ai';
import isEqual from 'lodash/isEqual';
import { type z } from 'zod';
import { aiCopilotConfigSchema } from '../../../../config/aiConfigSchema';
import { getAiConfig as getRawAiConfig } from '../../../../config/parseConfig';
import { getModel } from '../models';
import {
    fieldCatalog,
    filterPermutationCases,
    filterPermutationGroups,
    type ExpectedFilter,
    type LlmPermutationCase,
} from './filterPermutationCases';

export type FiltersInput = z.infer<typeof filtersSchemaV2>;
type FilterRuleInput = NonNullable<FiltersInput['dimensions']>[number];

type FilterPermutationModelOptions = ReturnType<typeof getModel>;
export type FilterPermutationToolSchemaMode = 'strict' | 'unstrict';
export type FilterPermutationProvider = 'openai' | 'anthropic';
export type FilterPermutationModelConfig = {
    label: string;
    provider: FilterPermutationProvider;
    modelName: string;
    requiredEnvVar: string;
};

export type FilterPermutationResult = {
    caseId: string;
    permutation: string;
    prompt: string;
    ok: boolean;
    errors: string[];
    filters: FiltersInput | null;
    text: string;
};

export const filterPermutationModelConfigs = [
    {
        label: 'OpenAI GPT-5 Mini',
        provider: 'openai',
        modelName: 'gpt-5-mini',
        requiredEnvVar: 'OPENAI_API_KEY',
    },
    {
        label: 'Anthropic Claude Sonnet 4.6',
        provider: 'anthropic',
        modelName: 'claude-sonnet-4-6',
        requiredEnvVar: 'ANTHROPIC_API_KEY',
    },
] as const satisfies readonly FilterPermutationModelConfig[];

const TODAY = new Date().toISOString();

const fieldCatalogText = Object.entries(fieldCatalog)
    .map(
        ([fieldId, field]) =>
            `- ${fieldId}: label="${field.label}", fieldType=${field.fieldType}, fieldFilterType=${field.fieldFilterType}`,
    )
    .join('\n');

const submitFiltersInputSchema = defineTool({
    name: 'submitFilters',
    title: 'Submit filters',
    description:
        'Submit the final Lightdash filters object. The input must match the Lightdash AI filters schema.',
    availability: ['agent'],
    inputSchema: filtersSchemaV2,
}).for('agent').inputSchema;

const systemPrompt = `You are a Lightdash metric-query filter builder.

Given a user request, call submitFilters exactly once with exactly one filter in dimensions.

Today is ${TODAY}.

Available fields:
${fieldCatalogText}

Rules:
- Put the generated filter in dimensions.
- Use field IDs exactly as listed above.
- Use fieldType and fieldFilterType exactly as listed above for the chosen field.
- Use the requested operator exactly.
- Use the requested values exactly when provided.
- Use the requested settings exactly when provided.
- For isNull/notNull operators, omit values and settings entirely.
- Never encode null, missing, or present checks as equals/notEquals/include with values like "null", "missing", "", or true.
- Do not add extra filters.
- Do not use natural-language phrases as values.
- Use ISO dates/datetimes for explicit date values.`;

type FilterPermutationProviderOptions = Record<
    string,
    Record<string, JSONValue>
>;

const getProviderOptions = (
    providerOptions: FilterPermutationProviderOptions | undefined,
): FilterPermutationProviderOptions | undefined => {
    if (!providerOptions?.openai) return providerOptions;

    return {
        ...providerOptions,
        openai: {
            ...providerOptions.openai,
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

export const isFilterPermutationModelConfigured = (
    modelConfig: FilterPermutationModelConfig,
): boolean => Boolean(process.env[modelConfig.requiredEnvVar]);

export const getFilterPermutationModelOptions = (
    modelConfig: FilterPermutationModelConfig = filterPermutationModelConfigs[0],
): FilterPermutationModelOptions => {
    const config = aiCopilotConfigSchema.parse(getRawAiConfig());
    if (!config.providers[modelConfig.provider]) {
        throw new Error(
            `${modelConfig.label} is not configured. Set existing ${modelConfig.requiredEnvVar}.`,
        );
    }

    return getModel(config, {
        provider: modelConfig.provider,
        modelName: modelConfig.modelName,
        enableReasoning: false,
    });
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
    let submittedFilters: FiltersInput | null = null;
    let toolCallCount = 0;

    try {
        const result = await generateText({
            ...modelOptions.callOptions,
            providerOptions: getProviderOptions(
                modelOptions.providerOptions as
                    | FilterPermutationProviderOptions
                    | undefined,
            ),
            model: modelOptions.model,
            maxRetries: 0,
            stopWhen: stepCountIs(1),
            toolChoice: 'required',
            system: systemPrompt,
            tools: {
                submitFilters: tool({
                    description:
                        'Submit the final Lightdash filters object. The input must match the Lightdash AI filters schema.',
                    inputSchema: submitFiltersInputSchema,
                    strict: toolSchemaMode === 'strict',
                    execute: async (input) => {
                        toolCallCount += 1;
                        submittedFilters = input;
                        return { ok: true };
                    },
                }),
            },
            messages: [{ role: 'user', content: probeCase.prompt }],
        });

        const filters = submittedFilters;
        if (!filters) {
            return {
                caseId: probeCase.id,
                permutation: probeCase.permutation,
                prompt: probeCase.prompt,
                ok: false,
                errors: ['model did not call submitFilters'],
                filters: null,
                text: result.text,
            };
        }

        const errors: string[] = [];
        if (toolCallCount !== 1) {
            errors.push(
                `submitFilters called ${toolCallCount} times; expected 1`,
            );
        }

        const schemaParse = filtersSchemaV2.safeParse(filters);
        if (!schemaParse.success) {
            return {
                caseId: probeCase.id,
                permutation: probeCase.permutation,
                prompt: probeCase.prompt,
                ok: false,
                errors: [
                    `filtersSchemaV2 failed: ${schemaParse.error.message}`,
                ],
                filters,
                text: result.text,
            };
        }

        const rules = schemaParse.data.dimensions ?? [];
        if (rules.length !== 1) {
            errors.push(
                `emitted ${rules.length} dimension filters; expected 1`,
            );
        }

        const rule = rules[0];
        if (!rule) {
            errors.push('missing first dimension filter');
        } else {
            errors.push(...validateExpectedFilter(rule, probeCase.expected));
        }

        try {
            errors.push(
                ...validateTransformedFilters(
                    schemaParse.data,
                    probeCase.expected,
                ),
            );
        } catch (error) {
            errors.push(
                `filtersSchemaTransformed failed: ${getErrorMessage(error)}`,
            );
        }

        return {
            caseId: probeCase.id,
            permutation: probeCase.permutation,
            prompt: probeCase.prompt,
            ok: errors.length === 0,
            errors,
            filters: schemaParse.data,
            text: result.text,
        };
    } catch (error) {
        return {
            caseId: probeCase.id,
            permutation: probeCase.permutation,
            prompt: probeCase.prompt,
            ok: false,
            errors: [getErrorMessage(error)],
            filters: submittedFilters,
            text: '',
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
    ];

    if (result.errors.length > 0) {
        lines.push(`Errors:\n- ${result.errors.join('\n- ')}`);
    }
    if (result.filters) {
        lines.push(`Filters: ${JSON.stringify(result.filters)}`);
        const firstRule = result.filters.dimensions?.[0];
        if (firstRule) {
            lines.push(`Rule: ${summarizeRule(firstRule)}`);
        }
    }
    if (result.text.trim()) {
        lines.push(`Text: ${result.text.trim()}`);
    }

    return lines.join('\n');
};

export { filterPermutationCases, filterPermutationGroups };
