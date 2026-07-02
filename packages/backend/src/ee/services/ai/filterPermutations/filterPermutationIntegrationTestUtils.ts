import { beforeAll, describe, expect, it } from 'vitest';
import {
    filterPermutationGroups,
    formatFilterPermutationResult,
    getFilterPermutationModelOptions,
    isFilterPermutationModelConfigured,
    runLlmFilterPermutationCase,
    type FilterPermutationModelConfig,
} from './llmFilterPermutationRunner';

export const defineFilterPermutationIntegrationSuite = (
    modelConfig: FilterPermutationModelConfig,
) => {
    const describeIfConfigured = isFilterPermutationModelConfigured(modelConfig)
        ? describe
        : describe.skip;

    describeIfConfigured(
        `AI filter permutations (${modelConfig.label}, unstrict)`,
        () => {
            let modelOptions: ReturnType<
                typeof getFilterPermutationModelOptions
            >;

            beforeAll(() => {
                modelOptions = getFilterPermutationModelOptions(modelConfig);
            });

            describe.each(filterPermutationGroups)(
                '$family $operator',
                (permutationGroup) => {
                    it.each(permutationGroup.cases)(
                        'generates $id',
                        async (testCase) => {
                            const result = await runLlmFilterPermutationCase({
                                probeCase: testCase,
                                modelOptions,
                                toolSchemaMode: 'unstrict',
                            });

                            if (!result.ok) {
                                throw new Error(
                                    formatFilterPermutationResult(result),
                                );
                            }

                            expect(result.errors).toEqual([]);
                            expect(result.ok).toBe(true);
                        },
                        120_000,
                    );
                },
            );
        },
    );
};
