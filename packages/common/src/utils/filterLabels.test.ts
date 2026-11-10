import {
    FilterOperator,
    FilterType,
    UnitOfTime,
    type FilterRule,
} from '../types/filter';
import {
    getConditionalRuleLabel,
    getFilterOperatorOptions,
} from './filterLabels';
import { DEFAULT_UI_STRINGS, type UiStringResolver } from './i18n/uiStrings';

const withOverride =
    (overrides: Record<string, string>): UiStringResolver =>
    (key) =>
        overrides[key] ?? DEFAULT_UI_STRINGS[key];

describe('getFilterOperatorOptions', () => {
    it('uses resolver labels', () => {
        const options = getFilterOperatorOptions(
            FilterType.STRING,
            undefined,
            withOverride({ 'filters.operators.equals': 'est' }),
        );
        expect(
            options.find(({ value }) => value === FilterOperator.EQUALS)?.label,
        ).toEqual('est');
    });

    it('defaults to English without a resolver', () => {
        const options = getFilterOperatorOptions(FilterType.STRING);
        expect(
            options.find(({ value }) => value === FilterOperator.EQUALS)?.label,
        ).toEqual('is');
    });

    it('uses date-specific labels for date filters', () => {
        const options = getFilterOperatorOptions(FilterType.DATE);
        expect(
            options.find(({ value }) => value === FilterOperator.LESS_THAN)
                ?.label,
        ).toEqual('is before');
    });
});

describe('getConditionalRuleLabel composed values', () => {
    const inTheCurrentRule: FilterRule = {
        id: 'rule-1',
        target: { fieldId: 'field-1' },
        operator: FilterOperator.IN_THE_CURRENT,
        values: [1],
        settings: { unitOfTime: UnitOfTime.days, completed: false },
    };

    it('renders the singular unit from defaults', () => {
        expect(
            getConditionalRuleLabel(inTheCurrentRule, FilterType.DATE, 'Field')
                .value,
        ).toEqual('day');
    });

    it('renders the singular unit from the resolver', () => {
        expect(
            getConditionalRuleLabel(
                inTheCurrentRule,
                FilterType.DATE,
                'Field',
                withOverride({ 'filters.unitsOfTime.days.singular': 'jour' }),
            ).value,
        ).toEqual('jour');
    });

    it('falls back to days when the unit of time is missing', () => {
        const rule: FilterRule = {
            id: 'rule-6',
            target: { fieldId: 'field-1' },
            operator: FilterOperator.IN_THE_PAST,
            values: [3],
            settings: { completed: false },
        };
        expect(
            getConditionalRuleLabel(rule, FilterType.DATE, 'Field').value,
        ).toEqual('3 days');
    });

    it('renders the whole period when toDate is off', () => {
        const rule: FilterRule = {
            ...inTheCurrentRule,
            operator: FilterOperator.NOT_IN_THE_CURRENT,
            settings: { unitOfTime: UnitOfTime.months, excludeToday: true },
        };
        const label = getConditionalRuleLabel(rule, FilterType.DATE, 'Field');
        expect(label.operator).toEqual('not in the current');
        expect(label.value).toEqual('month');
    });

    it('renders the whole period when the unit is a day or finer', () => {
        const rule: FilterRule = {
            ...inTheCurrentRule,
            settings: { unitOfTime: UnitOfTime.hours, toDate: true },
        };
        const label = getConditionalRuleLabel(rule, FilterType.DATE, 'Field');
        expect(label.value).toEqual('hour');
    });

    it('renders "to date" when toDate is on', () => {
        const rule: FilterRule = {
            ...inTheCurrentRule,
            settings: { unitOfTime: UnitOfTime.months, toDate: true },
        };
        const label = getConditionalRuleLabel(rule, FilterType.DATE, 'Field');
        expect(label.operator).toEqual('in the current');
        expect(label.value).toEqual('month to date');
    });

    it('renders "to date, excluding today" when excludeToday is on', () => {
        const rule: FilterRule = {
            ...inTheCurrentRule,
            settings: {
                unitOfTime: UnitOfTime.months,
                toDate: true,
                excludeToday: true,
            },
        };
        expect(
            getConditionalRuleLabel(rule, FilterType.DATE, 'Field').value,
        ).toEqual('month to date, excluding today');
        expect(
            getConditionalRuleLabel(
                rule,
                FilterType.DATE,
                'Field',
                withOverride({
                    'filters.currentPeriod.toDateExcludingTodayValue':
                        "{unit} à ce jour, hors aujourd'hui",
                    'filters.unitsOfTime.months.singular': 'mois',
                }),
            ).value,
        ).toEqual("mois à ce jour, hors aujourd'hui");
    });

    it('renders in-the-last values with the plural unit form', () => {
        const rule: FilterRule = {
            id: 'rule-2',
            target: { fieldId: 'field-1' },
            operator: FilterOperator.IN_THE_PAST,
            values: [3],
            settings: { unitOfTime: UnitOfTime.months, completed: true },
        };
        expect(
            getConditionalRuleLabel(rule, FilterType.DATE, 'Field').value,
        ).toEqual('3 completed months');
        expect(
            getConditionalRuleLabel(
                rule,
                FilterType.DATE,
                'Field',
                withOverride({
                    'filters.unitsOfTime.months.completedPlural':
                        'mois révolus',
                }),
            ).value,
        ).toEqual('3 mois révolus');
    });

    it('renders boolean values from defaults and resolver', () => {
        const rule: FilterRule = {
            id: 'rule-4',
            target: { fieldId: 'field-1' },
            operator: FilterOperator.EQUALS,
            values: [true],
        };
        expect(
            getConditionalRuleLabel(rule, FilterType.BOOLEAN, 'Field').value,
        ).toEqual('True');
        expect(
            getConditionalRuleLabel(
                rule,
                FilterType.BOOLEAN,
                'Field',
                withOverride({ 'filters.values.true': 'ჭეშმარიტი' }),
            ).value,
        ).toEqual('ჭეშმარიტი');
    });

    it('renders period-to-date labels', () => {
        const rule: FilterRule = {
            id: 'rule-3',
            target: { fieldId: 'field-1' },
            operator: FilterOperator.IN_PERIOD_TO_DATE,
            values: [2],
            settings: { unitOfTime: UnitOfTime.quarters, completed: false },
        };
        expect(
            getConditionalRuleLabel(rule, FilterType.DATE, 'Field').value,
        ).toEqual('quarter to date');
    });
});
