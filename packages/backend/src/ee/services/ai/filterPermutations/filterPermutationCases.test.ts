import { filtersSchemaV2 } from '@lightdash/common';
import {
    filterPermutationCases,
    filterPermutationGroups,
} from './filterPermutationCases';

describe('filter permutation cases', () => {
    it('has unique case IDs', () => {
        const ids = filterPermutationCases.map((testCase) => testCase.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('has at least 3 cases for each family/operator group', () => {
        expect(filterPermutationGroups.length).toBe(36);
        filterPermutationGroups.forEach((group) => {
            expect(group.cases.length).toBeGreaterThanOrEqual(3);
        });
    });

    it('defines valid expected filter payloads', () => {
        filterPermutationCases.forEach((testCase) => {
            const parseResult = filtersSchemaV2.safeParse({
                type: 'and',
                dimensions: [
                    {
                        fieldId: testCase.expected.fieldId,
                        fieldType: testCase.expected.fieldType,
                        fieldFilterType: testCase.expected.fieldFilterType,
                        operator: testCase.expected.operator,
                        ...(testCase.expected.values
                            ? { values: testCase.expected.values }
                            : {}),
                        ...(testCase.expected.settings
                            ? { settings: testCase.expected.settings }
                            : {}),
                    },
                ],
                metrics: null,
                tableCalculations: null,
            });

            if (!parseResult.success) {
                throw new Error(
                    `${testCase.id} failed schema validation: ${parseResult.error.message}`,
                );
            }

            expect(parseResult.success).toBe(true);
        });
    });
});
