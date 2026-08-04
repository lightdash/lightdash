import {
    filtersSchemaTransformed,
    filtersSchemaV2,
    FilterType,
    getFilterExamples,
} from '@lightdash/common';
import {
    filterPermutationCases,
    filterPermutationGroups,
} from './filterPermutationCases';

describe('filter permutation cases', () => {
    it('has unique case IDs', () => {
        const ids = filterPermutationCases.map((testCase) => testCase.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('has at least 3 cases for each available family/operator group', () => {
        const expectedGroupKeys = [
            { family: 'boolean', fieldFilterType: FilterType.BOOLEAN },
            { family: 'string', fieldFilterType: FilterType.STRING },
            { family: 'number', fieldFilterType: FilterType.NUMBER },
            { family: 'date', fieldFilterType: FilterType.DATE },
        ].flatMap(({ family, fieldFilterType }) =>
            Array.from(
                new Set(
                    getFilterExamples({
                        fieldId: 'field_id',
                        fieldType: fieldFilterType,
                        fieldFilterType,
                    }).map((example) => example.operator),
                ),
            ).map((operator) => `${family}.${operator}`),
        );
        const actualGroupKeys = filterPermutationGroups.map(
            (group) => `${group.family}.${group.operator}`,
        );

        expect(new Set(actualGroupKeys)).toEqual(new Set(expectedGroupKeys));
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

            const transformedParseResult = filtersSchemaTransformed.safeParse(
                parseResult.data,
            );
            if (!transformedParseResult.success) {
                throw new Error(
                    `${testCase.id} failed transformed schema validation: ${transformedParseResult.error.message}`,
                );
            }

            expect(parseResult.success).toBe(true);
            expect(transformedParseResult.success).toBe(true);
        });
    });
});
