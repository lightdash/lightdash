import moment from 'moment';
import {
    getDateGroupLabel,
    getFilterRuleWithDefaultValue,
    getPasswordSchema,
} from '.';
import {
    dateDayDimension,
    dateDayDimensionWithGroup,
    dateMonthDimension,
    dateYearDimension,
    emptyValueFilter,
    stringDimension,
} from './index.mock';

describe('Common index', () => {
    describe('default values on filter rule', () => {
        // TODO mock some timezones
        test('should return right default day value', async () => {
            const date = moment().format('YYYY-MM-DD');

            expect(
                getFilterRuleWithDefaultValue(
                    dateDayDimension,
                    emptyValueFilter,
                    undefined,
                ).values,
            ).toEqual([date]);
        });

        test('should return right default month value', async () => {
            const date = moment().format('YYYY-MM-01');

            expect(
                getFilterRuleWithDefaultValue(
                    dateMonthDimension,
                    emptyValueFilter,
                    undefined,
                ).values,
            ).toEqual([date]);
        });

        test('should return right default year value', async () => {
            const date = moment().format('YYYY-01-01');

            expect(
                getFilterRuleWithDefaultValue(
                    dateYearDimension,
                    emptyValueFilter,
                    undefined,
                ).values,
            ).toEqual([date]);
        });
    });

    describe('filter rule with default values', () => {
        test('should return with undefined values', async () => {
            expect(
                getFilterRuleWithDefaultValue(
                    stringDimension,
                    emptyValueFilter,
                    undefined,
                ).values,
            ).toEqual([]);
        });
        test('should return with empty values', async () => {
            expect(
                getFilterRuleWithDefaultValue(
                    stringDimension,
                    emptyValueFilter,
                    [],
                ).values,
            ).toEqual([]);
        });
        test('should return single value', async () => {
            expect(
                getFilterRuleWithDefaultValue(
                    stringDimension,
                    emptyValueFilter,
                    ['test'],
                ).values,
            ).toEqual(['test']);
        });
        test('should return multiple values', async () => {
            expect(
                getFilterRuleWithDefaultValue(
                    stringDimension,
                    emptyValueFilter,
                    ['test1', 'test2'],
                ).values,
            ).toEqual(['test1', 'test2']);
        });
    });
});

describe('Password Validation', () => {
    test('valid password', () => {
        const validPasswords = [
            'Lightdash1!',
            'Light@123',
            '#@#@#dash123',
            'light_dash',
        ];
        validPasswords.forEach((password) => {
            const result = getPasswordSchema().safeParse(password);
            expect(result.success).toBe(true);
        });
    });

    test('password missing letter', () => {
        const passwords = ['12345678!', '@$%^&*()123'];
        passwords.forEach((password) => {
            const result = getPasswordSchema().safeParse(password);
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.errors[0].message).toBe(
                    'must contain a letter',
                );
            }
        });
    });

    test('password missing number or symbol', () => {
        const passwords = ['PasswordOnlyLetters', 'AnotherPassword'];
        passwords.forEach((password) => {
            const result = getPasswordSchema().safeParse(password);
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.errors[0].message).toBe(
                    'must contain a number or symbol',
                );
            }
        });
    });

    test('password too short', () => {
        const invalidPasswords = ['short', 'only', '1234'];
        invalidPasswords.forEach((password) => {
            const result = getPasswordSchema().safeParse(password);
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.errors[0].message).toBe(
                    'must be at least 8 characters long',
                );
            }
        });
    });
});

describe('getDateGroupLabel', () => {
    test('returns undefined if not a date dimension', () => {
        expect(getDateGroupLabel(stringDimension)).toBeUndefined();
    });

    test('returns undefined if no group', () => {
        expect(getDateGroupLabel(dateDayDimension)).toBeUndefined();
    });

    test('removes time interval from end of label', () => {
        expect(getDateGroupLabel(dateDayDimensionWithGroup)).toEqual('date');

        expect(
            getDateGroupLabel({
                ...dateDayDimensionWithGroup,
                label: 'month dayday month date year day',
            }),
        ).toEqual('month dayday month date year'); // only replaces time frame at the end of string
    });

    test('returns friendly label if it cant recognise time interval', () => {
        expect(
            getDateGroupLabel({
                ...dateDayDimensionWithGroup,
                label: 'day date (day)',
            }),
        ).toEqual('Day date day'); // doesn't recognize (day) as a valid time frame
    });
});
