import { FilterOperator, type FilterRule } from '@lightdash/common';
import {
    getActiveFilterRules,
    toFieldCombinationIssue,
} from './apiSourceExplore';

const rule = (id: string, values: unknown[], disabled = false): FilterRule => ({
    id,
    target: { fieldId: 'field' },
    operator: FilterOperator.EQUALS,
    values,
    disabled,
});

describe('getActiveFilterRules', () => {
    it('keeps only enabled filters with values', () => {
        expect(
            getActiveFilterRules({
                id: 'root',
                and: [
                    rule('used', ['a']),
                    rule('off', ['a'], true),
                    rule('empty', []),
                ],
            }).map(({ id }) => id),
        ).toEqual(['used']);
    });

    it('is empty without filters', () => {
        expect(getActiveFilterRules(undefined)).toEqual([]);
    });
});

describe('toFieldCombinationIssue', () => {
    it('refuses the field as a combination', () => {
        expect(toFieldCombinationIssue('field', 'Why')).toEqual({
            code: 'live_source.refused.field_combination',
            fieldId: 'field',
            message: 'Why',
        });
    });
});
