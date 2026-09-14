import { FilterOperator, FilterType, UnitOfTime } from '../types/filter';
import {
    getConditionalRuleLabel,
    getFilterOperatorOptions,
} from './filterLabels';

// Golden matrix pinning the default (English) filter-label output. These
// strings render in the main app and as embed defaults; a snapshot change
// here is a user-visible copy change and must be deliberate.
// Excluded: date in-between / not-in-between values (timezone-dependent).

type GoldenCase = {
    filterType: FilterType;
    operator: FilterOperator;
    values: unknown[];
    settings?: { unitOfTime?: UnitOfTime; completed?: boolean };
    includeNull?: boolean;
};

const buildCases = (): GoldenCase[] => {
    const cases: GoldenCase[] = [];
    const baseValues: Record<FilterType, unknown[]> = {
        [FilterType.STRING]: ['a', 'b'],
        [FilterType.NUMBER]: [1, 2],
        [FilterType.BOOLEAN]: [true, false],
        [FilterType.DATE]: ['2020-01-01'],
    };
    const dateUnitOperators = [
        FilterOperator.IN_THE_PAST,
        FilterOperator.NOT_IN_THE_PAST,
        FilterOperator.IN_THE_NEXT,
        FilterOperator.IN_THE_CURRENT,
        FilterOperator.NOT_IN_THE_CURRENT,
        FilterOperator.IN_PERIOD_TO_DATE,
    ];
    const timezoneDependent = [
        FilterOperator.IN_BETWEEN,
        FilterOperator.NOT_IN_BETWEEN,
    ];

    for (const filterType of Object.values(FilterType)) {
        const operators = getFilterOperatorOptions(filterType).map(
            (o) => o.value,
        );
        const stableOperators = operators.filter(
            (operator) =>
                !(
                    filterType === FilterType.DATE &&
                    timezoneDependent.includes(operator)
                ),
        );
        for (const operator of stableOperators) {
            if (
                filterType === FilterType.DATE &&
                dateUnitOperators.includes(operator)
            ) {
                for (const unitOfTime of [
                    undefined,
                    ...Object.values(UnitOfTime),
                ]) {
                    for (const completed of [false, true]) {
                        cases.push({
                            filterType,
                            operator,
                            values: [3],
                            settings: { unitOfTime, completed },
                        });
                    }
                }
            } else {
                cases.push({
                    filterType,
                    operator,
                    values: baseValues[filterType],
                });
            }
            if (
                filterType === FilterType.STRING &&
                operator === FilterOperator.EQUALS
            ) {
                cases.push({
                    filterType,
                    operator,
                    values: baseValues[filterType],
                    includeNull: true,
                });
            }
        }
    }
    return cases;
};

describe('filter label golden matrix (English defaults)', () => {
    it('matches the pinned output', () => {
        const lines = buildCases().map((c) => {
            const rule = {
                id: 'golden-rule',
                target: { fieldId: 'field-1' },
                operator: c.operator,
                values: c.values,
                settings: c.settings,
                includeNull: c.includeNull,
            };
            const label = getConditionalRuleLabel(rule, c.filterType, 'Field');
            const settingsPart = c.settings
                ? ` unit=${c.settings.unitOfTime ?? 'none'} completed=${
                      c.settings.completed
                  }`
                : '';
            const nullPart = c.includeNull ? ' includeNull' : '';
            return `${c.filterType}/${c.operator}${settingsPart}${nullPart} => [${
                label.operator
            }] ${label.value ?? '<no value>'}`;
        });
        expect(lines).toMatchSnapshot();
    });
});
