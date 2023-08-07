import moment from 'moment';
import { getFilterRuleWithDefaultValue, validatePassword } from '.';
import {
    dateDayDimension,
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

describe('validatePassword', () => {
    it('should return true for valid password', () => {
        const validPasswords = ['Lightdash1!', 'Light@123', '#@#@#dash123'];

        validPasswords.forEach((password) => {
            const result = validatePassword(password);
            expect(result.isPasswordValid).toBe(true);
        });
    });

    it('should return false for passwords with invalid length', () => {
        const invalidPasswords = ['short', 'only', '1234'];

        invalidPasswords.forEach((password) => {
            const result = validatePassword(password);
            expect(result.isPasswordValid).toBe(false);
            expect(result.isLengthValid).toBe(false);
        });
    });

    it('should return false for passwords without letters', () => {
        const passwords = [
            '12345678!', // Missing letter
            '@$%^&*()123', // Missing letter
        ];

        passwords.forEach((password) => {
            const result = validatePassword(password);
            expect(result.isPasswordValid).toBe(false);
            expect(result.hasLetter).toBe(false);
        });
    });

    it('should return false for passwords without numbers or symbols', () => {
        const passwords = ['PasswordOnlyLetters', 'AnotherPassword'];

        passwords.forEach((password) => {
            const result = validatePassword(password);
            expect(result.isPasswordValid).toBe(false);
            expect(result.hasNumberOrSymbol).toBe(false);
        });
    });
});
