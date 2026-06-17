import { beforeAll, describe, expect, it } from 'vitest';
import {
    filterPermutationGroups,
    formatFilterPermutationResult,
    getFilterPermutationModelOptions,
    runLlmFilterPermutationCase,
} from './llmFilterPermutationRunner';

const describeIfOpenAiConfigured = process.env.OPENAI_API_KEY
    ? describe
    : describe.skip;

describeIfOpenAiConfigured('AI filter permutations (unstrict)', () => {
    let modelOptions: ReturnType<typeof getFilterPermutationModelOptions>;

    beforeAll(() => {
        modelOptions = getFilterPermutationModelOptions();
    });

    describe.each(filterPermutationGroups)(
        '$family $operator',
        (permutationGroup) => {
            it('has at least 3 prompt cases', () => {
                expect(permutationGroup.cases.length).toBeGreaterThanOrEqual(3);
            });

            it.each(permutationGroup.cases)(
                'generates $id',
                async (testCase) => {
                    const result = await runLlmFilterPermutationCase({
                        probeCase: testCase,
                        modelOptions,
                        toolSchemaMode: 'unstrict',
                    });

                    if (!result.ok) {
                        throw new Error(formatFilterPermutationResult(result));
                    }

                    expect(result.errors).toEqual([]);
                    expect(result.ok).toBe(true);
                },
                120_000,
            );
        },
    );
});
