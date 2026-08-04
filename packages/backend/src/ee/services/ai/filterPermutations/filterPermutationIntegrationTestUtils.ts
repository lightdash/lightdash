import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    filterPermutationGroups,
    formatFilterPermutationResult,
    getFilterPermutationModelOptions,
    isFilterPermutationModelConfigured,
    MAX_FILTER_PERMUTATION_ATTEMPTS,
    runLlmFilterPermutationCase,
    type FilterPermutationModelConfig,
} from './llmFilterPermutationRunner';

const formatSummaryList = (items: string[]): string =>
    items.length === 0
        ? '  - none'
        : items.map((item) => `  - ${item}`).join('\n');

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
            const summary = {
                total: 0,
                passed: 0,
                failed: 0,
                retried: 0,
                recovered: 0,
                failedAfterRetry: 0,
                failedWithoutRetry: 0,
                totalRetries: 0,
                retriedCases: [] as string[],
                failedCases: [] as string[],
            };

            beforeAll(() => {
                modelOptions = getFilterPermutationModelOptions(modelConfig);
            });

            afterAll(() => {
                process.stdout.write(`
AI filter permutation summary
Provider: ${modelConfig.label}
Cases: ${summary.total} total | ${summary.passed} passed | ${summary.failed} failed
Tool attempts: max ${MAX_FILTER_PERMUTATION_ATTEMPTS} | ${summary.retried} retried | ${summary.recovered} recovered | ${summary.failedAfterRetry} failed after retry | ${summary.failedWithoutRetry} failed without retry | ${summary.totalRetries} total retries

Retried cases:
${formatSummaryList(summary.retriedCases)}

Failed cases:
${formatSummaryList(summary.failedCases)}
`);
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

                            const caseLabel = `${result.permutation} :: ${result.caseId} (${result.attempts}/${result.maxAttempts} tool attempts, ${result.modelSteps} model steps)`;

                            summary.total += 1;
                            summary.totalRetries += result.retries;
                            if (result.ok) {
                                summary.passed += 1;
                            } else {
                                summary.failed += 1;
                                summary.failedCases.push(caseLabel);
                                if (result.retries === 0) {
                                    summary.failedWithoutRetry += 1;
                                }
                            }

                            if (result.retries > 0) {
                                summary.retried += 1;
                                summary.retriedCases.push(caseLabel);
                                if (result.ok) {
                                    summary.recovered += 1;
                                } else {
                                    summary.failedAfterRetry += 1;
                                }
                            }

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
