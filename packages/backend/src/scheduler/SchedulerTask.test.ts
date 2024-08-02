import { NotEnoughResults, ThresholdOperator } from '@lightdash/common';
import SchedulerTask from './SchedulerTask';
import {
    resultsWithOneRow,
    resultsWithTwoDecreasingRows,
    resultsWithTwoIncreasingRows,
    thresholdIncreasedByMock,
    thresholdLessThanMock,
} from './SchedulerTask.mock';

describe('isPositiveThresholdAlert', () => {
    it('should return false if there are no results or no thresholds', () => {
        expect(
            SchedulerTask.isPositiveThresholdAlert([thresholdLessThanMock], []),
        ).toBe(false);

        expect(
            SchedulerTask.isPositiveThresholdAlert([], resultsWithOneRow),
        ).toBe(false);
    });
    it('should throw error if operation requires second row but there isnt one', () => {
        expect(() =>
            SchedulerTask.isPositiveThresholdAlert(
                [thresholdIncreasedByMock],
                resultsWithOneRow,
            ),
        ).toThrowError(NotEnoughResults);
    });
    it('should return true if condition match', () => {
        expect(
            SchedulerTask.isPositiveThresholdAlert(
                [thresholdLessThanMock],
                resultsWithOneRow,
            ),
        ).toBe(true);
    });

    it('should test threshold INCREASED_BY', () => {
        const increasedByRevenue = (value: number) => [
            {
                operator: ThresholdOperator.INCREASED_BY,
                fieldId: 'revenue',
                value,
            },
        ];

        const lowValues = [0.1, 1, 2, 5, 8, 9]; // From 0.1% to 9%
        lowValues.forEach((value) => {
            expect(
                SchedulerTask.isPositiveThresholdAlert(
                    increasedByRevenue(value),
                    resultsWithTwoIncreasingRows,
                ),
            ).toBe(true);
        });
        const highValues = [10, 10.1, 15, 50, 100]; // From 10% to 100%
        highValues.forEach((value) => {
            expect(
                SchedulerTask.isPositiveThresholdAlert(
                    increasedByRevenue(value),
                    resultsWithTwoIncreasingRows,
                ),
            ).toBe(false);
        });

        // Test decrease

        expect(
            SchedulerTask.isPositiveThresholdAlert(
                increasedByRevenue(0.05),
                resultsWithTwoDecreasingRows,
            ),
        ).toBe(false);
        expect(
            SchedulerTask.isPositiveThresholdAlert(
                increasedByRevenue(0.8),
                resultsWithTwoDecreasingRows,
            ),
        ).toBe(false);
    });
    it('should test threshold DECREASED_BY', () => {
        const decreasedByRevenue = (value: number) => [
            {
                operator: ThresholdOperator.DECREASED_BY,
                fieldId: 'revenue',
                value,
            },
        ];

        const lowValues = [0.1, 1, 2, 5, 8, 9]; // From 0.1% to 9%
        lowValues.forEach((value) => {
            expect(
                SchedulerTask.isPositiveThresholdAlert(
                    decreasedByRevenue(value),
                    resultsWithTwoDecreasingRows,
                ),
            ).toBe(true);
        });
        const highValues = [10, 10.1, 15, 50, 100]; // From 10% to 100%
        highValues.forEach((value) => {
            expect(
                SchedulerTask.isPositiveThresholdAlert(
                    decreasedByRevenue(value),
                    resultsWithTwoDecreasingRows,
                ),
            ).toBe(false);
        });
    });
});
