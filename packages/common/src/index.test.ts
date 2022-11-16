import moment from 'moment';
import { getFilterRuleWithDefaultValue } from '.';
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
